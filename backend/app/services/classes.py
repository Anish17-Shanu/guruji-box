from __future__ import annotations

import secrets
from collections import defaultdict

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from ..models import (
    AssessmentAttempt,
    AssessmentAnswer,
    Class,
    ClassMembership,
    LearningProgress,
    Lesson,
    Question,
    Quiz,
    Subject,
    User,
    Worksheet,
    WorksheetStatus,
)

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_join_code(db: Session) -> str:
    for _ in range(25):
        code = "".join(secrets.choice(ALPHABET) for _ in range(6))
        if not db.scalar(select(Class.id).where(Class.join_code == code)):
            return code
    raise RuntimeError("Could not generate a unique join code")


def percent(score: int, total: int) -> float:
    return round(score * 100 / total, 1) if total else 0.0


def attempts_for(db: Session, learner_ids: list[int]) -> list[AssessmentAttempt]:
    if not learner_ids:
        return []
    return list(
        db.scalars(
            select(AssessmentAttempt)
            .where(AssessmentAttempt.user_id.in_(learner_ids))
            .order_by(AssessmentAttempt.created_at)
        )
    )


def latest_by_user(attempts: list[AssessmentAttempt]) -> dict[int, AssessmentAttempt]:
    latest: dict[int, AssessmentAttempt] = {}
    for attempt in attempts:
        latest[attempt.user_id] = attempt
    return latest


def class_learner_counts(db: Session, class_ids: list[int]) -> dict[int, int]:
    if not class_ids:
        return {}
    rows = db.execute(
        select(ClassMembership.class_id, func.count(ClassMembership.id))
        .where(ClassMembership.class_id.in_(class_ids))
        .group_by(ClassMembership.class_id)
    ).all()
    return {class_id: count for class_id, count in rows}


def class_metrics(db: Session, class_ids: list[int]) -> dict:
    if not class_ids:
        return {"learners": 0, "attempts": 0, "mean_latest_score": None}
    learner_ids = list(
        dict.fromkeys(
            db.scalars(
                select(ClassMembership.learner_id).where(ClassMembership.class_id.in_(class_ids))
            )
        )
    )
    attempts = attempts_for(db, learner_ids)
    latest = latest_by_user(attempts)
    mean_latest = (
        round(sum(percent(item.score, item.total) for item in latest.values()) / len(latest), 1)
        if latest
        else None
    )
    return {
        "learners": len(learner_ids),
        "attempts": len(attempts),
        "mean_latest_score": mean_latest,
    }


def class_summaries(db: Session, classes: list[Class], include_code: bool = True) -> list[dict]:
    counts = class_learner_counts(db, [item.id for item in classes])
    return [
        {
            "id": item.id,
            "name": item.name,
            "class_level": item.class_level,
            "join_code": item.join_code if include_code else None,
            "learner_count": counts.get(item.id, 0),
            "created_at": item.created_at,
        }
        for item in classes
    ]


def class_detail(db: Session, classroom: Class) -> dict:
    rows = db.execute(
        select(User, ClassMembership.joined_at)
        .join(ClassMembership, ClassMembership.learner_id == User.id)
        .where(ClassMembership.class_id == classroom.id)
        .order_by(User.display_name)
    ).all()
    learner_ids = [user.id for user, _ in rows]
    attempts = attempts_for(db, learner_ids)
    stats: dict[int, list[AssessmentAttempt]] = defaultdict(list)
    for attempt in attempts:
        stats[attempt.user_id].append(attempt)
    members = []
    for user, joined_at in rows:
        user_attempts = stats.get(user.id, [])
        mean = (
            round(sum(percent(item.score, item.total) for item in user_attempts) / len(user_attempts), 1)
            if user_attempts
            else None
        )
        members.append(
            {
                "learner_id": user.id,
                "display_name": user.display_name,
                "email": user.email,
                "joined_at": joined_at,
                "attempts": len(user_attempts),
                "mean_score": mean,
            }
        )
    return {
        "id": classroom.id,
        "name": classroom.name,
        "class_level": classroom.class_level,
        "join_code": classroom.join_code,
        "learner_count": len(members),
        "created_at": classroom.created_at,
        "members": members,
    }


def class_performance(db: Session, classroom: Class) -> dict:
    rows = db.execute(
        select(User, ClassMembership.joined_at)
        .join(ClassMembership, ClassMembership.learner_id == User.id)
        .where(ClassMembership.class_id == classroom.id)
        .order_by(User.display_name)
    ).all()
    learner_ids = [user.id for user, _ in rows]
    attempts = attempts_for(db, learner_ids)
    grouped: dict[int, list[AssessmentAttempt]] = defaultdict(list)
    for attempt in attempts:
        grouped[attempt.user_id].append(attempt)
    learners = []
    for user, _ in rows:
        items = grouped.get(user.id, [])
        latest = items[-1] if items else None
        learners.append(
            {
                "learner_id": user.id,
                "display_name": user.display_name,
                "attempts": len(items),
                "mean_score": round(
                    sum(percent(item.score, item.total) for item in items) / len(items), 1
                )
                if items
                else None,
                "latest_score": percent(latest.score, latest.total) if latest else None,
                "last_attempt_at": latest.created_at if latest else None,
            }
        )
    all_mean = (
        round(sum(percent(item.score, item.total) for item in attempts) / len(attempts), 1)
        if attempts
        else None
    )
    latest_map = latest_by_user(attempts)
    mean_latest = (
        round(sum(percent(item.score, item.total) for item in latest_map.values()) / len(latest_map), 1)
        if latest_map
        else None
    )
    return {
        "class_id": classroom.id,
        "class_name": classroom.name,
        "learner_count": len(rows),
        "learners_with_attempts": len({item.user_id for item in attempts}),
        "attempts": len(attempts),
        "mean_score": all_mean,
        "mean_latest_score": mean_latest,
        "learners": learners,
    }


def learning_gaps(db: Session, classroom: Class) -> dict:
    member_ids = list(
        db.scalars(select(ClassMembership.learner_id).where(ClassMembership.class_id == classroom.id))
    )
    if not member_ids:
        return {"class_id": classroom.id, "class_name": classroom.name, "most_missed_questions": []}
    rows = db.execute(
        select(
            AssessmentAnswer.question_id,
            Question.prompt,
            Question.topic,
            Lesson.title,
            func.count(AssessmentAnswer.id),
            func.count(distinct(AssessmentAttempt.user_id)),
        )
        .join(AssessmentAttempt, AssessmentAttempt.id == AssessmentAnswer.attempt_id)
        .join(Question, Question.id == AssessmentAnswer.question_id)
        .join(Quiz, Quiz.id == Question.quiz_id)
        .join(Lesson, Lesson.id == Quiz.lesson_id)
        .where(
            AssessmentAttempt.user_id.in_(member_ids),
            AssessmentAnswer.correct.is_(False),
        )
        .group_by(AssessmentAnswer.question_id, Question.prompt, Question.topic, Lesson.title)
        .order_by(func.count(AssessmentAnswer.id).desc())
        .limit(20)
    ).all()
    return {
        "class_id": classroom.id,
        "class_name": classroom.name,
        "most_missed_questions": [
            {
                "question_id": question_id,
                "prompt": prompt,
                "topic": topic,
                "lesson_title": lesson_title,
                "misses": misses,
                "affected_learners": affected,
            }
            for question_id, prompt, topic, lesson_title, misses, affected in rows
        ],
    }


def teacher_dashboard(db: Session, user: User) -> dict:
    query = select(Class).order_by(Class.created_at)
    if user.role.value != "ADMIN":
        query = query.where(Class.teacher_id == user.id)
    classes = list(db.scalars(query))
    metrics = class_metrics(db, [item.id for item in classes])
    worksheet_query = select(func.count(Worksheet.id)).where(
        Worksheet.status == WorksheetStatus.DRAFT
    )
    if user.role.value != "ADMIN":
        worksheet_query = worksheet_query.where(Worksheet.teacher_id == user.id)
    draft_worksheets = db.scalar(worksheet_query) or 0
    return {
        "classes": class_summaries(db, classes),
        "learners": metrics["learners"],
        "attempts": metrics["attempts"],
        "mean_latest_score": metrics["mean_latest_score"],
        "draft_worksheets": draft_worksheets,
    }


def learner_progress_rows(db: Session, user: User) -> list[dict]:
    rows = db.execute(
        select(LearningProgress, Lesson)
        .join(Lesson, Lesson.id == LearningProgress.lesson_id)
        .where(LearningProgress.user_id == user.id)
        .order_by(LearningProgress.last_attempt_at.desc())
    ).all()
    result = []
    for progress, lesson in rows:
        if progress.mastery >= 80:
            recommendation = "Strong work. Try a harder practice worksheet or help a classmate."
        elif progress.mastery >= 50:
            recommendation = "Review the questions you missed, then retake the quiz."
        else:
            recommendation = "Read the lesson sections again, ask the tutor, then retake the quiz."
        result.append(
            {
                "lesson_id": lesson.id,
                "lesson_slug": lesson.slug,
                "title": lesson.title,
                "topic": lesson.topic,
                "subject": db.scalar(select(Subject.name).where(Subject.id == lesson.subject_id))
                or "",
                "mastery": progress.mastery,
                "attempts": progress.attempts,
                "last_attempt_at": progress.last_attempt_at,
                "recommendation": recommendation,
            }
        )
    return result
