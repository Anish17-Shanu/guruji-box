"""Idempotent curriculum/seed command.

Usage:
    cd backend && python -m app.seed
    cd backend && python -m app.seed --content-only
    cd backend && python -m app.seed --no-demo
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from sqlalchemy import select

from .core.config import get_settings
from .core.security import hash_password
from .database import SessionLocal
from .models import (
    Class,
    ClassMembership,
    Lesson,
    LessonSection,
    LessonSource,
    Question,
    Quiz,
    Role,
    SkillCourse,
    SkillLesson,
    Subject,
    User,
)

settings = get_settings()


def find_data_dir() -> Path:
    candidates = []
    if settings.content_dir:
        candidates.append(Path(settings.content_dir))
    candidates.extend(
        [
            Path(__file__).resolve().parents[2] / "data",
            Path("/app/data"),
            Path.cwd() / "data",
            Path.cwd().parent / "data",
        ]
    )
    for candidate in candidates:
        if (candidate / "curriculum").is_dir():
            return candidate
    raise SystemExit("Could not find the data directory. Set CONTENT_DIR to the folder containing curriculum/.")


def seed_curriculum(db) -> dict:
    data_dir = find_data_dir()
    counts = {"subjects": 0, "lessons": 0, "questions": 0, "courses": 0, "skill_lessons": 0}
    for path in sorted((data_dir / "curriculum").glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        default_attribution = payload.get("attribution", "Original GURUJI BOX educational content")
        default_license = payload.get("license", "CC BY 4.0")
        for subject_payload in payload.get("subjects", []):
            subject = db.scalar(select(Subject).where(Subject.slug == subject_payload["slug"]))
            if not subject:
                subject = Subject(
                    slug=subject_payload["slug"],
                    name=subject_payload["name"],
                    class_level=payload["class_level"],
                )
                db.add(subject)
                counts["subjects"] += 1
            else:
                subject.name = subject_payload["name"]
                subject.class_level = payload["class_level"]
            db.flush()
            for lesson_payload in subject_payload.get("lessons", []):
                lesson = db.scalar(select(Lesson).where(Lesson.slug == lesson_payload["slug"]))
                if not lesson:
                    lesson = Lesson(slug=lesson_payload["slug"], subject_id=subject.id)
                    db.add(lesson)
                    counts["lessons"] += 1
                lesson.subject_id = subject.id
                lesson.title = lesson_payload["title"]
                lesson.topic = lesson_payload["topic"]
                lesson.class_level = payload["class_level"]
                lesson.summary = lesson_payload["summary"]
                lesson.estimated_minutes = lesson_payload.get("estimated_minutes", 20)
                lesson.position = lesson_payload.get("position", 0)
                db.flush()
                for position, section_payload in enumerate(lesson_payload.get("sections", []), start=1):
                    section = db.scalar(
                        select(LessonSection).where(
                            LessonSection.lesson_id == lesson.id,
                            LessonSection.position == position,
                        )
                    )
                    if not section:
                        section = LessonSection(lesson_id=lesson.id, position=position)
                        db.add(section)
                    section.heading = section_payload["heading"]
                    section.passage = section_payload["passage"]
                source = db.scalar(
                    select(LessonSource).where(LessonSource.lesson_id == lesson.id)
                )
                if not source:
                    source = LessonSource(lesson_id=lesson.id)
                    db.add(source)
                source.attribution = lesson_payload.get("attribution", default_attribution)
                source.license = lesson_payload.get("license", default_license)
                quiz_payload = lesson_payload.get("quiz")
                if quiz_payload:
                    quiz = db.scalar(select(Quiz).where(Quiz.lesson_id == lesson.id))
                    if not quiz:
                        quiz = Quiz(lesson_id=lesson.id, title=quiz_payload["title"])
                        db.add(quiz)
                    quiz.title = quiz_payload["title"]
                    db.flush()
                    for position, question_payload in enumerate(
                        quiz_payload.get("questions", []), start=1
                    ):
                        question = db.scalar(
                            select(Question).where(
                                Question.quiz_id == quiz.id,
                                Question.position == position,
                            )
                        )
                        if not question:
                            question = Question(quiz_id=quiz.id, position=position)
                            db.add(question)
                            counts["questions"] += 1
                        question.prompt = question_payload["prompt"]
                        question.choices = question_payload["choices"]
                        question.answer = question_payload["answer"]
                        question.explanation = question_payload["explanation"]
                        question.topic = question_payload["topic"]

    for path in sorted((data_dir / "skill_courses").glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        for course_payload in payload.get("courses", []):
            course = db.scalar(select(SkillCourse).where(SkillCourse.slug == course_payload["slug"]))
            if not course:
                course = SkillCourse(slug=course_payload["slug"], title=course_payload["title"])
                db.add(course)
                counts["courses"] += 1
            course.title = course_payload["title"]
            course.description = course_payload["description"]
            course.position = course_payload.get("position", 0)
            db.flush()
            for position, lesson_payload in enumerate(course_payload.get("lessons", []), start=1):
                lesson = db.scalar(
                    select(SkillLesson).where(
                        SkillLesson.course_id == course.id,
                        SkillLesson.slug == lesson_payload["slug"],
                    )
                )
                if not lesson:
                    lesson = SkillLesson(
                        course_id=course.id,
                        slug=lesson_payload["slug"],
                        position=position,
                    )
                    db.add(lesson)
                    counts["skill_lessons"] += 1
                lesson.title = lesson_payload["title"]
                lesson.body = lesson_payload["body"]
                lesson.position = position
    db.commit()
    return counts


def seed_demo(db) -> bool:
    if settings.is_production or not settings.seed_demo:
        print("Demo accounts skipped.")
        return False
    teacher = db.scalar(select(User).where(User.email == "teacher@guruji.demo"))
    if not teacher:
        teacher = User(
            display_name="Demo Teacher",
            email="teacher@guruji.demo",
            password_hash=hash_password("DemoPass123!"),
            role=Role.TEACHER,
        )
        db.add(teacher)
        db.flush()
    learner = db.scalar(select(User).where(User.email == "learner@guruji.demo"))
    if not learner:
        learner = User(
            display_name="Demo Learner",
            email="learner@guruji.demo",
            password_hash=hash_password("DemoPass123!"),
            role=Role.LEARNER,
        )
        db.add(learner)
        db.flush()
    admin = db.scalar(select(User).where(User.email == "admin@guruji.demo"))
    if not admin:
        admin = User(
            display_name="Demo Admin",
            email="admin@guruji.demo",
            password_hash=hash_password("DemoPass123!"),
            role=Role.ADMIN,
        )
        db.add(admin)
        db.flush()
    classroom = db.scalar(select(Class).where(Class.name == "Demo Class 6"))
    if not classroom:
        classroom = Class(
            name="Demo Class 6",
            class_level=6,
            teacher_id=teacher.id,
            join_code="DEMO01",
        )
        db.add(classroom)
        db.flush()
    membership = db.scalar(
        select(ClassMembership).where(
            ClassMembership.class_id == classroom.id,
            ClassMembership.learner_id == learner.id,
        )
    )
    if not membership:
        db.add(ClassMembership(class_id=classroom.id, learner_id=learner.id))
    db.commit()
    print("Demo accounts ready: teacher@guruji.demo / learner@guruji.demo / admin@guruji.demo")
    print("Demo password: DemoPass123!   Demo join code: DEMO01")
    return True


def run(with_demo: bool | None = None) -> None:
    db = SessionLocal()
    try:
        counts = seed_curriculum(db)
        print(
            "Curriculum seeded: "
            + ", ".join(f"{key}={value}" for key, value in counts.items())
        )
        demo_enabled = settings.seed_demo if with_demo is None else with_demo
        if demo_enabled:
            seed_demo(db)
        else:
            print("Demo accounts skipped.")
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed GURUJI BOX curriculum content")
    parser.add_argument("--content-only", action="store_true", help="Skip demo accounts")
    parser.add_argument("--demo", action="store_true", help="Create demo accounts (non-production)")
    parser.add_argument("--no-demo", action="store_true", help="Skip demo accounts")
    args = parser.parse_args()
    with_demo = None
    if args.content_only or args.no_demo:
        with_demo = False
    elif args.demo:
        with_demo = True
    run(with_demo)


if __name__ == "__main__":
    main()
