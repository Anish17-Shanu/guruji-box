from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..audit import record_audit
from ..core.errors import ApiError
from ..database import get_db
from ..deps import get_owned_class, require_roles
from ..models import Class, ClassMembership, Role, User
from ..schemas import (
    AddMemberIn,
    ClassCreateIn,
    ClassDetailOut,
    ClassMemberOut,
    ClassPerformanceOut,
    ClassSummaryOut,
    ClassUpdateIn,
    LearningGapsOut,
    TeacherDashboardOut,
)
from ..services import classes as class_service

router = APIRouter(prefix="/teacher", tags=["teacher"])
teacher_roles = require_roles(Role.TEACHER, Role.ADMIN)


@router.get("/dashboard", response_model=TeacherDashboardOut)
def dashboard(
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    return class_service.teacher_dashboard(db, user)


@router.post("/classes", response_model=ClassSummaryOut, status_code=201)
def create_class(
    payload: ClassCreateIn,
    request: Request,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    classroom = Class(
        name=payload.name,
        class_level=payload.class_level,
        teacher_id=user.id,
        join_code=class_service.new_join_code(db),
    )
    db.add(classroom)
    db.flush()
    record_audit(
        db,
        "class.created",
        user_id=user.id,
        request=request,
        entity_type="class",
        entity_id=classroom.id,
    )
    db.commit()
    db.refresh(classroom)
    return {
        "id": classroom.id,
        "name": classroom.name,
        "class_level": classroom.class_level,
        "join_code": classroom.join_code,
        "learner_count": 0,
        "created_at": classroom.created_at,
    }


@router.get("/classes/{class_id}", response_model=ClassDetailOut)
def class_detail(
    class_id: int,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    classroom = get_owned_class(class_id, user, db)
    return class_service.class_detail(db, classroom)


@router.patch("/classes/{class_id}", response_model=ClassSummaryOut)
def update_class(
    class_id: int,
    payload: ClassUpdateIn,
    request: Request,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    classroom = get_owned_class(class_id, user, db)
    classroom.name = payload.name
    classroom.class_level = payload.class_level
    record_audit(
        db,
        "class.updated",
        user_id=user.id,
        request=request,
        entity_type="class",
        entity_id=classroom.id,
    )
    db.commit()
    db.refresh(classroom)
    detail = class_service.class_detail(db, classroom)
    return detail


@router.delete("/classes/{class_id}", status_code=204)
def delete_class(
    class_id: int,
    request: Request,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    classroom = get_owned_class(class_id, user, db)
    db.execute(delete(ClassMembership).where(ClassMembership.class_id == classroom.id))
    record_audit(
        db,
        "class.deleted",
        user_id=user.id,
        request=request,
        entity_type="class",
        entity_id=classroom.id,
        detail={"name": classroom.name},
    )
    db.delete(classroom)
    db.commit()
    return Response(status_code=204)


@router.post("/classes/{class_id}/rotate-code", response_model=ClassSummaryOut)
def rotate_code(
    class_id: int,
    request: Request,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    classroom = get_owned_class(class_id, user, db)
    classroom.join_code = class_service.new_join_code(db)
    record_audit(
        db,
        "class.code_rotated",
        user_id=user.id,
        request=request,
        entity_type="class",
        entity_id=classroom.id,
    )
    db.commit()
    db.refresh(classroom)
    detail = class_service.class_detail(db, classroom)
    return detail


@router.get("/classes/{class_id}/learners", response_model=list[ClassMemberOut])
def class_members(
    class_id: int,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    classroom = get_owned_class(class_id, user, db)
    return class_service.class_detail(db, classroom)["members"]


@router.post("/classes/{class_id}/members", response_model=ClassMemberOut, status_code=201)
def add_member(
    class_id: int,
    payload: AddMemberIn,
    request: Request,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    classroom = get_owned_class(class_id, user, db)
    learner = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if not learner or learner.role != Role.LEARNER or not learner.is_active:
        raise ApiError(404, "No active learner was found with that email.", "learner_not_found")
    existing = db.scalar(
        select(ClassMembership).where(
            ClassMembership.class_id == classroom.id,
            ClassMembership.learner_id == learner.id,
        )
    )
    if existing:
        raise ApiError(409, "This learner is already in the class.", "already_member")
    membership = ClassMembership(class_id=classroom.id, learner_id=learner.id)
    db.add(membership)
    record_audit(
        db,
        "class.member_added",
        user_id=user.id,
        request=request,
        entity_type="class",
        entity_id=classroom.id,
        detail={"learner_id": learner.id},
    )
    db.commit()
    db.refresh(membership)
    return {
        "learner_id": learner.id,
        "display_name": learner.display_name,
        "email": learner.email,
        "joined_at": membership.joined_at,
        "attempts": 0,
        "mean_score": None,
    }


@router.delete("/classes/{class_id}/members/{learner_id}", status_code=204)
def remove_member(
    class_id: int,
    learner_id: int,
    request: Request,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    classroom = get_owned_class(class_id, user, db)
    membership = db.scalar(
        select(ClassMembership).where(
            ClassMembership.class_id == classroom.id,
            ClassMembership.learner_id == learner_id,
        )
    )
    if not membership:
        raise ApiError(404, "Learner is not in this class.", "membership_not_found")
    db.delete(membership)
    record_audit(
        db,
        "class.member_removed",
        user_id=user.id,
        request=request,
        entity_type="class",
        entity_id=classroom.id,
        detail={"learner_id": learner_id},
    )
    db.commit()
    return Response(status_code=204)


@router.get("/classes/{class_id}/performance", response_model=ClassPerformanceOut)
def performance(
    class_id: int,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    classroom = get_owned_class(class_id, user, db)
    return class_service.class_performance(db, classroom)


@router.get("/classes/{class_id}/learning-gaps", response_model=LearningGapsOut)
def gaps(
    class_id: int,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    classroom = get_owned_class(class_id, user, db)
    return class_service.learning_gaps(db, classroom)
