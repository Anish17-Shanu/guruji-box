from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..core.errors import ApiError
from ..database import get_db
from ..deps import get_current_user, get_optional_user
from ..models import SkillCourse, SkillLesson, SkillProgress, User
from ..schemas import (
    SkillCourseDetailOut,
    SkillCourseProgressOut,
    SkillCourseSummaryOut,
    SkillLessonOut,
    SkillProgressIn,
    SkillProgressOut,
)

router = APIRouter(prefix="/skills", tags=["skills"])


def _course_lessons(db: Session, course_id: int) -> list[SkillLesson]:
    return list(
        db.scalars(
            select(SkillLesson)
            .where(SkillLesson.course_id == course_id)
            .order_by(SkillLesson.position)
        )
    )


def _completed_ids(db: Session, user: User | None) -> set[int]:
    if not user:
        return set()
    return set(
        db.scalars(
            select(SkillProgress.skill_lesson_id).where(
                SkillProgress.user_id == user.id, SkillProgress.completed.is_(True)
            )
        )
    )


@router.get("/courses", response_model=list[SkillCourseSummaryOut])
def courses(
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    courses_list = list(db.scalars(select(SkillCourse).order_by(SkillCourse.position, SkillCourse.id)))
    completed = _completed_ids(db, user)
    results = []
    for course in courses_list:
        lessons = _course_lessons(db, course.id)
        results.append(
            {
                "id": course.id,
                "slug": course.slug,
                "title": course.title,
                "description": course.description,
                "lesson_count": len(lessons),
                "completed_count": len([lesson for lesson in lessons if lesson.id in completed]),
            }
        )
    return results


@router.get("/courses/{course_id}", response_model=SkillCourseDetailOut)
def course(
    course_id: int,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    course_obj = db.get(SkillCourse, course_id)
    if not course_obj:
        raise ApiError(404, "Course not found.", "course_not_found")
    lessons = _course_lessons(db, course_obj.id)
    completed = _completed_ids(db, user)
    return {
        "id": course_obj.id,
        "slug": course_obj.slug,
        "title": course_obj.title,
        "description": course_obj.description,
        "lesson_count": len(lessons),
        "completed_count": len([lesson for lesson in lessons if lesson.id in completed]),
        "lessons": [
            {
                "id": lesson.id,
                "slug": lesson.slug,
                "title": lesson.title,
                "body": lesson.body,
                "position": lesson.position,
                "completed": lesson.id in completed,
            }
            for lesson in lessons
        ],
    }


@router.get("/progress/me", response_model=list[SkillCourseProgressOut])
def my_progress(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    courses_list = list(db.scalars(select(SkillCourse).order_by(SkillCourse.position, SkillCourse.id)))
    completed = _completed_ids(db, user)
    return [
        {
            "id": course.id,
            "title": course.title,
            "completed": len([lesson for lesson in _course_lessons(db, course.id) if lesson.id in completed]),
            "total": len(_course_lessons(db, course.id)),
            "lessons": [
                {
                    "id": lesson.id,
                    "slug": lesson.slug,
                    "title": lesson.title,
                    "body": lesson.body,
                    "position": lesson.position,
                    "completed": lesson.id in completed,
                }
                for lesson in _course_lessons(db, course.id)
            ],
        }
        for course in courses_list
    ]


@router.post("/progress", response_model=SkillProgressOut)
def update_progress(
    payload: SkillProgressIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lesson = db.get(SkillLesson, payload.lesson_id)
    if not lesson:
        raise ApiError(404, "Skill lesson not found.", "skill_lesson_not_found")
    progress = db.scalar(
        select(SkillProgress).where(
            SkillProgress.user_id == user.id,
            SkillProgress.skill_lesson_id == payload.lesson_id,
        )
    )
    if not progress:
        progress = SkillProgress(user_id=user.id, skill_lesson_id=payload.lesson_id)
        db.add(progress)
    progress.completed = payload.completed
    progress.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(progress)
    return progress
