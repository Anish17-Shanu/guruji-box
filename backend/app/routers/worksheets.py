from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import record_audit
from ..core.errors import ApiError
from ..database import get_db
from ..deps import require_roles
from ..models import Role, User, Worksheet, WorksheetStatus
from ..schemas import (
    WorksheetGenerateIn,
    WorksheetOut,
    WorksheetPatchIn,
    WorksheetSummaryOut,
)
from ..services import worksheets as worksheet_service

router = APIRouter(prefix="/worksheets", tags=["worksheets"])
teacher_roles = require_roles(Role.TEACHER, Role.ADMIN)


def _owned(db: Session, worksheet_id: int, user: User) -> Worksheet:
    worksheet = db.get(Worksheet, worksheet_id)
    if not worksheet or (worksheet.teacher_id != user.id and user.role != Role.ADMIN):
        raise ApiError(404, "Worksheet not found.", "worksheet_not_found")
    return worksheet


def _summary(worksheet: Worksheet) -> dict:
    return {
        "id": worksheet.id,
        "title": worksheet.title,
        "subject": worksheet.subject,
        "topic": worksheet.topic,
        "class_level": worksheet.class_level,
        "difficulty": worksheet.difficulty,
        "status": worksheet.status,
        "question_count": len(worksheet.content.get("questions", [])),
        "generated_by": worksheet.generated_by,
        "created_at": worksheet.created_at,
        "updated_at": worksheet.updated_at,
    }


@router.get("", response_model=list[WorksheetSummaryOut])
def list_worksheets(
    status: WorksheetStatus | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    query = select(Worksheet).order_by(Worksheet.created_at.desc()).limit(limit)
    if user.role != Role.ADMIN:
        query = query.where(Worksheet.teacher_id == user.id)
    if status:
        query = query.where(Worksheet.status == status)
    return [_summary(item) for item in db.scalars(query)]


@router.post("/generate", response_model=WorksheetOut, status_code=201)
def generate_worksheet(
    payload: WorksheetGenerateIn,
    request: Request,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    worksheet = worksheet_service.generate(db, user, payload)
    record_audit(
        db,
        "worksheet.generated",
        user_id=user.id,
        request=request,
        entity_type="worksheet",
        entity_id=worksheet.id,
        detail={"topic": worksheet.topic, "generated_by": worksheet.generated_by},
    )
    db.commit()
    return worksheet


@router.get("/{worksheet_id}", response_model=WorksheetOut)
def get_worksheet(
    worksheet_id: int,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    return _owned(db, worksheet_id, user)


@router.patch("/{worksheet_id}", response_model=WorksheetOut)
def update_worksheet(
    worksheet_id: int,
    payload: WorksheetPatchIn,
    request: Request,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    worksheet = _owned(db, worksheet_id, user)
    content_changed = payload.content is not None
    if payload.content is not None:
        worksheet.content = payload.content.model_dump()
        worksheet.title = payload.content.title
    if payload.status is not None:
        worksheet.status = payload.status
    elif content_changed:
        worksheet.status = WorksheetStatus.DRAFT
    record_audit(
        db,
        "worksheet.updated",
        user_id=user.id,
        request=request,
        entity_type="worksheet",
        entity_id=worksheet.id,
        detail={"status": worksheet.status.value, "content_changed": content_changed},
    )
    db.commit()
    db.refresh(worksheet)
    return worksheet


@router.delete("/{worksheet_id}", status_code=204)
def delete_worksheet(
    worksheet_id: int,
    request: Request,
    user: User = Depends(teacher_roles),
    db: Session = Depends(get_db),
):
    worksheet = _owned(db, worksheet_id, user)
    record_audit(
        db,
        "worksheet.deleted",
        user_id=user.id,
        request=request,
        entity_type="worksheet",
        entity_id=worksheet.id,
    )
    db.delete(worksheet)
    db.commit()
    return Response(status_code=204)
