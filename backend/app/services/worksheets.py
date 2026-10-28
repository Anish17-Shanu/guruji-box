from __future__ import annotations

import logging
import random
import re
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai.provider import (
    GeminiProvider,
    ProviderError,
    ai_available,
    mark_ai_failure,
    mark_ai_success,
)
from ..core.config import get_settings
from ..core.errors import ApiError
from ..models import Lesson, LessonSource, LessonSection, Subject, User, Worksheet
from ..schemas import WorksheetGenerateIn

logger = logging.getLogger("guruji.worksheets")
settings = get_settings()
WORD_RE = re.compile(r"[A-Za-z][A-Za-z'-]{4,}")
SENTENCE_RE = re.compile(r"(?<=[.!?])\s+")
GENERIC_DISTRACTORS = ["Not mentioned here", "A different idea", "No clear answer"]


def keywords(text: str, limit: int = 12) -> list[str]:
    counts = Counter(
        word for word in WORD_RE.findall(text) if word.lower() not in {"which", "there", "their"}
    )
    return [word for word, _ in counts.most_common(limit)]


def sentences(text: str) -> list[str]:
    return [part.strip() for part in SENTENCE_RE.split(text) if part.strip()]


def deterministic_questions(
    pairs: list[tuple[Lesson, LessonSection]],
    formats: list[str],
    count: int,
    start: int = 0,
) -> list[dict]:
    if not pairs:
        return []
    all_words: list[str] = []
    for _, section in pairs:
        all_words.extend(keywords(section.passage))
    questions: list[dict] = []
    for offset in range(count):
        index = start + offset
        lesson, section = pairs[index % len(pairs)]
        kind = formats[index % len(formats)]
        section_words = keywords(section.passage) or keywords(section.heading) or ["idea"]
        keyword = section_words[index % len(section_words)]
        sentence_options = [item for item in sentences(section.passage) if keyword.lower() in item.lower()]
        sentence = (sentence_options or sentences(section.passage) or [section.passage])[0]
        blanked = re.sub(re.escape(keyword), "_____", sentence, count=1, flags=re.IGNORECASE)
        if "_____" not in blanked:
            blanked = f"_____ is discussed in this section. ({sentence})"

        if kind == "fill_blank":
            prompt = f"Complete the sentence: {blanked}"
            answer_key = keyword
        elif kind == "mcq":
            others = [
                word
                for word in dict.fromkeys(all_words)
                if word.lower() != keyword.lower()
            ][:3]
            choices = [keyword, *others]
            choices.extend(GENERIC_DISTRACTORS[: max(0, 4 - len(choices))])
            choices = choices[:4]
            random.Random(f"{section.heading}:{index}").shuffle(choices)
            prompt = f"Which word best completes this sentence? {blanked}"
            answer_key = keyword
            questions.append(
                {
                    "kind": "mcq",
                    "prompt": prompt,
                    "choices": choices,
                    "answer_key": answer_key,
                    "explanation": f"Review the section “{section.heading}” in {lesson.title}.",
                    "source_section": section.heading,
                }
            )
            continue
        elif kind == "true_false":
            is_true = index % 2 == 0
            negation = "" if is_true else " not"
            prompt = (
                f"True or false: the section “{section.heading}” does{negation} "
                f"discuss {keyword.lower()} in {lesson.title}."
            )
            questions.append(
                {
                    "kind": "true_false",
                    "prompt": prompt,
                    "choices": ["True", "False"],
                    "answer_key": "True" if is_true else "False",
                    "explanation": f"The section “{section.heading}” discusses this idea.",
                    "source_section": section.heading,
                }
            )
            continue
        else:
            prompt = f"Explain “{section.heading}” in your own words using ideas from {lesson.title}."
            answer_key = section.passage

        questions.append(
            {
                "kind": kind,
                "prompt": prompt,
                "choices": None,
                "answer_key": answer_key,
                "explanation": f"Look for the key idea in the section “{section.heading}”.",
                "source_section": section.heading,
            }
        )
    return questions


def find_pairs(db: Session, brief: WorksheetGenerateIn) -> list[tuple[Lesson, LessonSection]]:
    if brief.lesson_id is not None:
        lesson = db.get(Lesson, brief.lesson_id)
        if not lesson:
            raise ApiError(404, "Lesson not found.", "lesson_not_found")
        lessons = [lesson]
    else:
        query = (
            select(Lesson)
            .join(Subject, Subject.id == Lesson.subject_id)
            .where(Lesson.class_level == brief.class_level)
            .where(
                (Lesson.topic.ilike(f"%{brief.topic}%"))
                | (Lesson.title.ilike(f"%{brief.topic}%"))
            )
            .order_by(Lesson.position)
            .limit(3)
        )
        if brief.subject.strip():
            query = query.where(Subject.name.ilike(f"%{brief.subject.strip()}%"))
        lessons = list(db.scalars(query))
        if not lessons:
            query = (
                select(Lesson)
                .where(Lesson.topic.ilike(f"%{brief.topic}%"))
                .order_by(Lesson.position)
                .limit(3)
            )
            lessons = list(db.scalars(query))
    if not lessons:
        raise ApiError(
            404,
            "No lesson content matches that topic. Choose a topic from the curriculum.",
            "topic_not_found",
        )
    pairs: list[tuple[Lesson, LessonSection]] = []
    for lesson in lessons:
        sections = list(
            db.scalars(
                select(LessonSection)
                .where(LessonSection.lesson_id == lesson.id)
                .order_by(LessonSection.position)
            )
        )
        pairs.extend((lesson, section) for section in sections)
    return pairs


def generate(db: Session, teacher: User, brief: WorksheetGenerateIn) -> Worksheet:
    pairs = find_pairs(db, brief)
    formats = [str(item) for item in brief.formats]
    generated_by = "deterministic"
    model_name: str | None = None
    title = f"{brief.topic.strip()} — {brief.difficulty.title()} practice"
    instructions = (
        "Answer in your notebook. Write full sentences for short answers. "
        "Your teacher will review the answer key with you."
    )
    questions = deterministic_questions(pairs, formats, brief.count)
    sections = list(dict.fromkeys((lesson.id, section.heading) for lesson, section in pairs))

    if ai_available(settings):
        try:
            generated = GeminiProvider().worksheet(
                {
                    "class_level": brief.class_level,
                    "subject": brief.subject or "General",
                    "topic": brief.topic,
                    "difficulty": brief.difficulty,
                    "count": brief.count,
                },
                [
                    {
                        "id": section.id,
                        "heading": section.heading,
                        "text": section.passage,
                    }
                    for _, section in pairs
                ],
                formats,
            )
            ai_questions = [item.model_dump() for item in generated.questions][: brief.count]
            if ai_questions:
                if len(ai_questions) < brief.count:
                    pad = deterministic_questions(
                        pairs, formats, brief.count - len(ai_questions), start=len(ai_questions)
                    )
                    ai_questions.extend(pad)
                questions = ai_questions
                title = generated.title
                instructions = generated.instructions or instructions
                generated_by = "gemini"
                model_name = settings.gemini_model
                mark_ai_success()
        except ProviderError as exc:
            mark_ai_failure()
            logger.warning("worksheet_provider_fallback topic=%s error=%s", brief.topic, exc.message)

    sources = []
    seen: set[int] = set()
    for lesson, _ in pairs:
        if lesson.id in seen:
            continue
        seen.add(lesson.id)
        attribution = db.scalar(
            select(LessonSource.attribution).where(LessonSource.lesson_id == lesson.id)
        )
        license_name = db.scalar(
            select(LessonSource.license).where(LessonSource.lesson_id == lesson.id)
        )
        sources.append(
            {
                "lesson_id": lesson.id,
                "lesson_title": lesson.title,
                "attribution": attribution,
                "license": license_name,
                "sections": [heading for cid, heading in sections if cid == lesson.id],
            }
        )

    subject_name = brief.subject.strip()
    if not subject_name:
        subject_name = db.scalar(
            select(Subject.name)
            .join(Lesson, Lesson.subject_id == Subject.id)
            .where(Lesson.id == pairs[0][0].id)
        ) or "General"

    worksheet = Worksheet(
        teacher_id=teacher.id,
        title=title,
        class_level=brief.class_level,
        subject=subject_name,
        topic=brief.topic.strip(),
        difficulty=brief.difficulty,
        content={"title": title, "instructions": instructions, "questions": questions},
        sources=sources,
        generated_by=generated_by,
        model_name=model_name,
    )
    db.add(worksheet)
    db.commit()
    db.refresh(worksheet)
    return worksheet
