from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Attendance
from backend.app.schemas import AttendanceResponse, Page

router = APIRouter(prefix="/attendance", tags=["Attendance"])


@router.get("/", response_model=Page[AttendanceResponse])
def list_attendance(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    user_id: Optional[int] = None,
    status: Optional[Literal["PRESENT", "LATE", "ABSENT", "ON_LEAVE"]] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Attendance)
    if user_id is not None:
        query = query.filter(Attendance.user_id == user_id)
    if status is not None:
        query = query.filter(Attendance.status == status)
    if date_from is not None:
        query = query.filter(Attendance.date >= date_from)
    if date_to is not None:
        query = query.filter(Attendance.date <= date_to)

    total = query.count()
    rows = (query.order_by(Attendance.date.desc(), Attendance.user_id)
                 .offset(skip).limit(limit).all())
    return {"total": total, "skip": skip, "limit": limit,
            "items": [AttendanceResponse.model_validate(r) for r in rows]}


@router.get("/summary")
def attendance_summary(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Last-30-day attendance per active employee (v_attendance_summary), lowest attendance first."""
    where = "WHERE department_id = :dept" if department_id is not None else ""
    params = {"dept": department_id, "skip": skip, "limit": limit}

    total = db.execute(text(f"SELECT COUNT(*) FROM v_attendance_summary {where}"), params).scalar()
    rows = db.execute(text(f"""
        SELECT * FROM v_attendance_summary {where}
        ORDER BY attendance_rate_pct ASC NULLS LAST, user_id
        OFFSET :skip LIMIT :limit
    """), params).mappings().all()
    return {"total": total, "skip": skip, "limit": limit, "items": [dict(r) for r in rows]}
