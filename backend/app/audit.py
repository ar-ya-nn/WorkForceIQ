from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import AuditLog
from backend.app.schemas import AuditLogResponse, Page

router = APIRouter(prefix="/audit", tags=["Audit"])


@router.get("/", response_model=Page[AuditLogResponse])
def list_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    table_name: Optional[Literal["users", "employee_profiles", "leave_requests", "performance_reviews"]] = None,
    user_id: Optional[int] = None,
    action: Optional[Literal["INSERT", "UPDATE", "DELETE"]] = None,
    db: Session = Depends(get_db),
):
    """Change history written automatically by the audit triggers, newest first."""
    query = db.query(AuditLog)
    if table_name is not None:
        query = query.filter(AuditLog.table_name == table_name)
    if user_id is not None:
        query = query.filter(AuditLog.user_id == user_id)
    if action is not None:
        query = query.filter(AuditLog.action == action)

    total = query.count()
    rows = query.order_by(AuditLog.log_id.desc()).offset(skip).limit(limit).all()
    return {"total": total, "skip": skip, "limit": limit,
            "items": [AuditLogResponse.model_validate(r) for r in rows]}
