from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Lesson, LessonSection
from app.services.tutor import rank_sections

EVAL_FILE = Path(__file__).resolve().parents[2] / "data" / "eval" / "questions.json"


def test_every_lesson_has_sections_and_quiz(client):
    lessons = client.get("/api/v1/lessons").json()
    assert len(lessons) == 4
    for lesson in lessons:
        detail = client.get(f"/api/v1/lessons/{lesson['id']}").json()
        assert len(detail["sections"]) >= 3
        assert detail["quiz_id"]
        quiz = client.get(f"/api/v1/quizzes/{detail['quiz_id']}").json()
        assert len(quiz["questions"]) == 5
        answers = [question["choices"] for question in quiz["questions"]]
        assert all(len(choices) == 4 for choices in answers)
        assert len({question["prompt"] for question in quiz["questions"]}) == 5


def test_offline_retriever_matches_evaluation_cases():
    cases = json.loads(EVAL_FILE.read_text(encoding="utf-8"))
    db = SessionLocal()
    try:
        lessons = {lesson.title: lesson for lesson in db.scalars(select(Lesson))}
        for case in cases:
            lesson = lessons[case["lesson"]]
            sections = list(
                db.scalars(
                    select(LessonSection)
                    .where(LessonSection.lesson_id == lesson.id)
                    .order_by(LessonSection.position)
                )
            )
            ranked = rank_sections(case["question"], sections)
            headings = [section.heading for section, _ in ranked]
            if case["expected_section"]:
                assert headings, f"No section found for: {case['question']}"
                assert case["expected_section"] in headings, (
                    f"{case['question']} retrieved {headings}, expected {case['expected_section']}"
                )
            else:
                assert not headings, f"{case['question']} unexpectedly retrieved {headings}"
    finally:
        db.close()
