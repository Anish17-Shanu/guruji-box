from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from ..audit import record_audit
from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import (
    TutorAnswerOut,
    TutorAskIn,
    TutorSessionDetailOut,
    TutorSessionSummaryOut,
)
from ..services import tutor as tutor_service

router = APIRouter(prefix="/tutor", tags=["tutor"])


@router.post("/chat", response_model=TutorAnswerOut)
def chat(
    payload: TutorAskIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = tutor_service.ask(db, user, payload.lesson_id, payload.question)
    record_audit(
        db,
        "tutor.asked",
        user_id=user.id,
        request=request,
        entity_type="lesson",
        entity_id=payload.lesson_id,
        detail={"session_id": result["session_id"], "insufficient": result["insufficient_evidence"]},
    )
    db.commit()
    return result


@router.get("/sessions", response_model=list[TutorSessionSummaryOut])
def sessions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return tutor_service.list_sessions(db, user)


@router.get("/sessions/{session_id}", response_model=TutorSessionDetailOut)
def session_detail(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return tutor_service.session_detail(db, user, session_id)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(
    session_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tutor_service.delete_session(db, user, session_id)
    return Response(status_code=204)
