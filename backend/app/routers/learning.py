from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import record_audit
from ..core.errors import ApiError
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..models import (
    AssessmentAnswer,
    AssessmentAttempt,
    Class,
    ClassMembership,
    LearningProgress,
    Lesson,
    LessonSection,
    LessonSource,
    Question,
    Quiz,
    Role,
    Subject,
    User,
)
from ..schemas import (
    AttemptDetailOut,
    AttemptOut,
    JoinClassIn,
    LearnerClassOut,
    LessonDetailOut,
    LessonSummaryOut,
    ProgressOut,
    QuestionOut,
    QuizOut,
    ReviewItemOut,
    SubmitIn,
    SubmitOut,
    SubjectOut,
)
from ..services.classes import learner_progress_rows, percent

router = APIRouter(tags=["learning"])


@router.get("/subjects", response_model=list[SubjectOut])
def list_subjects(db: Session = Depends(get_db)):
    return list(db.scalars(select(Subject).order_by(Subject.class_level, Subject.name)))


@router.get("/lessons", response_model=list[LessonSummaryOut])
def list_lessons(
    class_level: int | None = Query(default=None, ge=1, le=12),
    subject: str | None = None,
    topic: str | None = None,
    db: Session = Depends(get_db),
):
    query = select(Lesson, Subject.name).join(Subject, Subject.id == Lesson.subject_id)
    if class_level:
        query = query.where(Lesson.class_level == class_level)
    if subject:
        query = query.where(Subject.name.ilike(f"%{subject.strip()}%"))
    if topic:
        query = query.where(Lesson.topic.ilike(f"%{topic.strip()}%"))
    rows = db.execute(query.order_by(Lesson.class_level, Lesson.position, Lesson.title)).all()
    return [
        {
            "id": lesson.id,
            "slug": lesson.slug,
            "title": lesson.title,
            "topic": lesson.topic,
            "summary": lesson.summary,
            "class_level": lesson.class_level,
            "subject": subject_name,
            "estimated_minutes": lesson.estimated_minutes,
        }
        for lesson, subject_name in rows
    ]


@router.get("/lessons/{lesson_id}", response_model=LessonDetailOut)
def get_lesson(lesson_id: int, db: Session = Depends(get_db)):
    lesson = db.get(Lesson, lesson_id)
    if not lesson:
        raise ApiError(404, "Lesson not found.", "lesson_not_found")
    subject_name = db.scalar(select(Subject.name).where(Subject.id == lesson.subject_id)) or ""
    sections = list(
        db.scalars(
            select(LessonSection)
            .where(LessonSection.lesson_id == lesson.id)
            .order_by(LessonSection.position)
        )
    )
    quiz_id = db.scalar(select(Quiz.id).where(Quiz.lesson_id == lesson.id))
    source = db.scalar(select(LessonSource).where(LessonSource.lesson_id == lesson.id))
    return {
        "id": lesson.id,
        "slug": lesson.slug,
        "title": lesson.title,
        "topic": lesson.topic,
        "summary": lesson.summary,
        "class_level": lesson.class_level,
        "subject": subject_name,
        "estimated_minutes": lesson.estimated_minutes,
        "sections": sections,
        "quiz_id": quiz_id,
        "attribution": source.attribution if source else None,
        "license": source.license if source else None,
    }


@router.get("/quizzes/{quiz_id}", response_model=QuizOut)
def get_quiz(quiz_id: int, db: Session = Depends(get_db)):
    quiz = db.get(Quiz, quiz_id)
    if not quiz:
        raise ApiError(404, "Quiz not found.", "quiz_not_found")
    questions = list(
        db.scalars(
            select(Question).where(Question.quiz_id == quiz.id).order_by(Question.position, Question.id)
        )
    )
    return {
        "id": quiz.id,
        "title": quiz.title,
        "lesson_id": quiz.lesson_id,
        "questions": questions,
    }


@router.post("/assessments/submit", response_model=SubmitOut)
def submit_assessment(
    payload: SubmitIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    questions = list(
        db.scalars(
            select(Question).where(Question.quiz_id == payload.quiz_id).order_by(Question.position, Question.id)
        )
    )
    if not questions:
        raise ApiError(404, "Quiz not found.", "quiz_not_found")
    quiz = db.get(Quiz, payload.quiz_id)
    given = {answer.question_id: answer.selected.strip() for answer in payload.answers}
    attempt = AssessmentAttempt(user_id=user.id, quiz_id=payload.quiz_id, score=0, total=len(questions))
    db.add(attempt)
    db.flush()
    score = 0
    review: list[dict] = []
    for question in questions:
        selected = given.get(question.id, "")
        correct = selected == question.answer
        score += int(correct)
        db.add(
            AssessmentAnswer(
                attempt_id=attempt.id,
                question_id=question.id,
                selected=selected,
                correct=correct,
            )
        )
        review.append(
            {
                "question_id": question.id,
                "prompt": question.prompt,
                "selected": selected,
                "correct": correct,
                "answer": question.answer,
                "explanation": question.explanation,
                "topic": question.topic,
            }
        )
    attempt.score = score
    result_percent = percent(score, len(questions))
    lesson_id = quiz.lesson_id if quiz else None
    progress = None
    if lesson_id:
        progress = db.scalar(
            select(LearningProgress).where(
                LearningProgress.user_id == user.id,
                LearningProgress.lesson_id == lesson_id,
            )
        )
        if not progress:
            progress = LearningProgress(user_id=user.id, lesson_id=lesson_id)
            db.add(progress)
        progress.mastery = int(round(result_percent))
        progress.attempts = (progress.attempts or 0) + 1
        progress.last_attempt_at = datetime.now(timezone.utc)
    wrong_topics = list(dict.fromkeys(item["topic"] for item in review if not item["correct"]))
    if wrong_topics:
        recommendation = "Review " + ", ".join(wrong_topics[:2]) + " in the lesson, then try the quiz again."
    else:
        recommendation = "Excellent work. You have mastered this quiz — try helping a classmate or move to the next topic."
    record_audit(
        db,
        "assessment.submitted",
        user_id=user.id,
        request=request,
        entity_type="quiz",
        entity_id=payload.quiz_id,
        detail={"score": score, "total": len(questions)},
    )
    db.commit()
    return {
        "attempt_id": attempt.id,
        "score": score,
        "total": len(questions),
        "percent": int(round(result_percent)),
        "mastery": progress.mastery if progress else int(round(result_percent)),
        "recommendation": recommendation,
        "review": review,
    }


@router.get("/assessments/history", response_model=list[AttemptOut])
def assessment_history(
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(AssessmentAttempt, Quiz.title, Lesson.id, Lesson.title)
        .join(Quiz, Quiz.id == AssessmentAttempt.quiz_id)
        .join(Lesson, Lesson.id == Quiz.lesson_id)
        .where(AssessmentAttempt.user_id == user.id)
        .order_by(AssessmentAttempt.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": attempt.id,
            "quiz_id": attempt.quiz_id,
            "quiz_title": quiz_title,
            "lesson_id": lesson_id,
            "lesson_title": lesson_title,
            "score": attempt.score,
            "total": attempt.total,
            "percent": int(round(percent(attempt.score, attempt.total))),
            "created_at": attempt.created_at,
        }
        for attempt, quiz_title, lesson_id, lesson_title in rows
    ]


@router.get("/assessments/{attempt_id}", response_model=AttemptDetailOut)
def attempt_detail(
    attempt_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    attempt = db.get(AssessmentAttempt, attempt_id)
    if not attempt or attempt.user_id != user.id:
        raise ApiError(404, "Attempt not found.", "attempt_not_found")
    quiz = db.get(Quiz, attempt.quiz_id)
    lesson = db.get(Lesson, quiz.lesson_id) if quiz else None
    rows = db.execute(
        select(AssessmentAnswer, Question)
        .join(Question, Question.id == AssessmentAnswer.question_id)
        .where(AssessmentAnswer.attempt_id == attempt.id)
        .order_by(Question.position, Question.id)
    ).all()
    review = [
        ReviewItemOut(
            question_id=question.id,
            prompt=question.prompt,
            selected=answer.selected,
            correct=answer.correct,
            answer=question.answer,
            explanation=question.explanation,
            topic=question.topic,
        )
        for answer, question in rows
    ]
    return {
        "id": attempt.id,
        "quiz_id": attempt.quiz_id,
        "quiz_title": quiz.title if quiz else "Quiz",
        "lesson_id": lesson.id if lesson else 0,
        "lesson_title": lesson.title if lesson else "Lesson",
        "score": attempt.score,
        "total": attempt.total,
        "percent": int(round(percent(attempt.score, attempt.total))),
        "created_at": attempt.created_at,
        "review": review,
    }


@router.get("/learners/me/progress", response_model=list[ProgressOut])
def my_progress(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return learner_progress_rows(db, user)


@router.get("/learners/me/classes", response_model=list[LearnerClassOut])
def my_classes(
    user: User = Depends(require_roles(Role.LEARNER)),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        select(Class, User.display_name, ClassMembership.joined_at)
        .join(ClassMembership, ClassMembership.class_id == Class.id)
        .join(User, User.id == Class.teacher_id)
        .where(ClassMembership.learner_id == user.id)
        .order_by(Class.name)
    ).all()
    return [
        {
            "id": classroom.id,
            "name": classroom.name,
            "class_level": classroom.class_level,
            "teacher_name": teacher_name,
            "joined_at": joined_at,
        }
        for classroom, teacher_name, joined_at in rows
    ]


@router.post("/learners/me/classes/join", response_model=LearnerClassOut)
def join_class(
    payload: JoinClassIn,
    request: Request,
    user: User = Depends(require_roles(Role.LEARNER)),
    db: Session = Depends(get_db),
):
    classroom = db.scalar(select(Class).where(Class.join_code == payload.code))
    if not classroom:
        raise ApiError(404, "No class was found with that code.", "join_code_not_found")
    membership = db.scalar(
        select(ClassMembership).where(
            ClassMembership.class_id == classroom.id,
            ClassMembership.learner_id == user.id,
        )
    )
    if not membership:
        membership = ClassMembership(class_id=classroom.id, learner_id=user.id)
        db.add(membership)
        record_audit(
            db,
            "class.joined",
            user_id=user.id,
            request=request,
            entity_type="class",
            entity_id=classroom.id,
        )
        db.commit()
    teacher_name = db.scalar(select(User.display_name).where(User.id == classroom.teacher_id)) or "Teacher"
    return {
        "id": classroom.id,
        "name": classroom.name,
        "class_level": classroom.class_level,
        "teacher_name": teacher_name,
        "joined_at": membership.joined_at,
    }
