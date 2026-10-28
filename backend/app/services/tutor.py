from __future__ import annotations

import logging
import re
from collections import Counter

from sqlalchemy import func, select
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
from ..models import Lesson, LessonSection, TutorMessage, TutorSession, User

logger = logging.getLogger("guruji.tutor")
settings = get_settings()
TOKEN_RE = re.compile(r"[a-z0-9\u0900-\u097F]+", re.IGNORECASE)
STOPWORDS = {
    "a",
    "about",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "can",
    "do",
    "does",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "me",
    "of",
    "on",
    "or",
    "please",
    "tell",
    "that",
    "the",
    "this",
    "to",
    "us",
    "was",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "with",
    "you",
    "का",
    "के",
    "की",
    "को",
    "में",
    "से",
    "पर",
    "और",
    "है",
    "हैं",
    "था",
    "थी",
    "थे",
    "क्या",
    "कैसे",
    "क्यों",
    "कब",
    "कहाँ",
    "कौन",
    "किसे",
    "किस",
    "यह",
    "वह",
    "ये",
    "वे",
    "तो",
    "भी",
    "ही",
    "ने",
    "एक",
    "होता",
    "होती",
    "होते",
    "होना",
    "करना",
}


def stem(word: str) -> str:
    if len(word) > 4 and word.endswith("ies"):
        return word[:-3] + "y"
    if len(word) > 4 and word.endswith("es"):
        return word[:-2]
    if len(word) > 4 and word.endswith(("ing", "ed")):
        return word[:-3] if word.endswith("ing") else word[:-2]
    if len(word) > 3 and word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def terms(text: str) -> list[str]:
    return [stem(token) for token in TOKEN_RE.findall(text.lower())]


def content_terms(text: str) -> list[str]:
    result: list[str] = []
    for raw in TOKEN_RE.findall(text.lower()):
        if len(raw) < 2 or raw in STOPWORDS:
            continue
        word = stem(raw)
        if word in STOPWORDS:
            continue
        result.append(word)
    return result


def rank_sections(question: str, sections: list[LessonSection]) -> list[tuple[LessonSection, float]]:
    query = list(dict.fromkeys(content_terms(question)))
    if not query:
        return []
    query_set = set(query)
    scored: list[tuple[LessonSection, float]] = []
    for section in sections:
        body_counts = Counter(terms(section.passage))
        heading_set = set(terms(section.heading))
        overlap = query_set & set(body_counts)
        heading_overlap = query_set & heading_set
        coverage = len(overlap) / len(query_set)
        raw_score = len(overlap) + 2 * len(heading_overlap)
        if raw_score:
            scored.append((section, raw_score + coverage))
    scored.sort(key=lambda item: (-item[1], item[0].position))
    return scored


def build_grounded_answer(section: LessonSection) -> str:
    return f"From the lesson section “{section.heading}”: {section.passage}"


def get_lesson(db: Session, lesson_id: int) -> Lesson:
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise ApiError(404, "Lesson not found.", "lesson_not_found")
    return lesson


def ask(db: Session, user: User, lesson_id: int, question: str) -> dict:
    lesson = get_lesson(db, lesson_id)
    sections = list(
        db.scalars(
            select(LessonSection)
            .where(LessonSection.lesson_id == lesson.id)
            .order_by(LessonSection.position)
        )
    )
    ranked = rank_sections(question, sections)
    insufficient = True
    answer = (
        "This lesson does not contain enough information to answer that question. "
        "Try asking about one of the lesson sections."
    )
    sources: list[dict] = []
    ai_used = False

    if ranked:
        top = [section for section, _ in ranked[:3]]
        primary = top[0]
        insufficient = False
        answer = build_grounded_answer(primary)
        sources = [
            {"lesson_id": lesson.id, "section_id": section.id, "heading": section.heading}
            for section in top
        ]
    elif sections:
        top = sections[:3]
    else:
        top = []

    if top and ai_available(settings):
        try:
            reply = GeminiProvider().answer(
                question=question,
                passages=[{"id": section.id, "heading": section.heading, "text": section.passage} for section in top],
                lesson_title=lesson.title,
                lesson_topic=lesson.topic,
                lesson_summary=lesson.summary or "",
            )
            if reply.passage_ids:
                used = [section for section in top if section.id in reply.passage_ids]
                if not used and top:
                    used = [top[0]]
                answer = reply.answer
                sources = [
                    {"lesson_id": lesson.id, "section_id": section.id, "heading": section.heading}
                    for section in used
                ]
                insufficient = False
                ai_used = True
            else:
                insufficient = True
                answer = reply.answer
                sources = []
                ai_used = True
            mark_ai_success()
        except ProviderError as exc:
            mark_ai_failure()
            logger.warning("tutor_provider_fallback lesson=%s error=%s", lesson.id, exc.message)

    session = TutorSession(user_id=user.id, lesson_id=lesson.id)
    db.add(session)
    db.flush()
    db.add_all(
        [
            TutorMessage(session_id=session.id, role="user", content=question),
            TutorMessage(session_id=session.id, role="assistant", content=answer),
        ]
    )
    db.commit()
    return {
        "session_id": session.id,
        "answer": answer,
        "sources": sources,
        "insufficient_evidence": insufficient,
        "ai_used": ai_used,
    }


def list_sessions(db: Session, user: User, limit: int = 50) -> list[dict]:
    rows = db.execute(
        select(TutorSession, Lesson.title)
        .join(Lesson, Lesson.id == TutorSession.lesson_id)
        .where(TutorSession.user_id == user.id)
        .order_by(TutorSession.created_at.desc())
        .limit(limit)
    ).all()
    ids = [session.id for session, _ in rows]
    counts: dict[int, int] = {}
    if ids:
        counts = dict(
            db.execute(
                select(TutorMessage.session_id, func.count(TutorMessage.id))
                .where(TutorMessage.session_id.in_(ids))
                .group_by(TutorMessage.session_id)
            ).all()
        )
    return [
        {
            "id": session.id,
            "lesson_id": session.lesson_id,
            "lesson_title": title,
            "created_at": session.created_at,
            "message_count": counts.get(session.id, 0),
        }
        for session, title in rows
    ]


def session_detail(db: Session, user: User, session_id: int) -> dict:
    session = db.get(TutorSession, session_id)
    if not session or session.user_id != user.id:
        raise ApiError(404, "Tutor session not found.", "tutor_session_not_found")
    lesson = db.get(Lesson, session.lesson_id)
    messages = list(
        db.scalars(
            select(TutorMessage)
            .where(TutorMessage.session_id == session.id)
            .order_by(TutorMessage.created_at, TutorMessage.id)
        )
    )
    return {
        "id": session.id,
        "lesson_id": session.lesson_id,
        "lesson_title": lesson.title if lesson else "Lesson",
        "created_at": session.created_at,
        "messages": messages,
    }


def delete_session(db: Session, user: User, session_id: int) -> None:
    session = db.get(TutorSession, session_id)
    if not session or session.user_id != user.id:
        raise ApiError(404, "Tutor session not found.", "tutor_session_not_found")
    db.delete(session)
    db.commit()
