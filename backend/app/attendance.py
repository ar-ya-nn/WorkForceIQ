from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from backend.app.auth import (ADMIN, EMPLOYEE, MANAGER, CurrentUser, department_scope,
                              ensure_can_view, get_current_user, require_roles)
from backend.app.database import db_error_message, get_db
from backend.app.models import Attendance, User
from backend.app.schemas import AttendanceResponse, AttendanceUpsert, Page

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
    user: CurrentUser = Depends(get_current_user),
):
    """Admin: everyone. Manager: own department. Employee: only their own records."""
    if user.role == EMPLOYEE:
        user_id = user.user_id
    elif user_id is not None:
        ensure_can_view(db, user, user_id)

    query = db.query(Attendance)
    scope = department_scope(user)
    if user.role == MANAGER:
        query = query.join(User, User.user_id == Attendance.user_id).filter(User.department_id == scope)
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
    user: CurrentUser = Depends(require_roles(ADMIN, MANAGER)),
):
    """Last-30-day attendance per active employee (v_attendance_summary), lowest attendance first."""
    scope = department_scope(user)
    if scope is not None:
        department_id = scope
    where = "WHERE department_id = :dept" if department_id is not None else ""
    params = {"dept": department_id, "skip": skip, "limit": limit}

    total = db.execute(text(f"SELECT COUNT(*) FROM v_attendance_summary {where}"), params).scalar()
    rows = db.execute(text(f"""
        SELECT * FROM v_attendance_summary {where}
        ORDER BY attendance_rate_pct ASC NULLS LAST, user_id
        OFFSET :skip LIMIT :limit
    """), params).mappings().all()
    return {"total": total, "skip": skip, "limit": limit, "items": [dict(r) for r in rows]}


@router.put("/", response_model=AttendanceResponse)
def record_attendance(data: AttendanceUpsert, db: Session = Depends(get_db),
                      user: CurrentUser = Depends(require_roles(ADMIN, MANAGER))):
    """
    Records or corrects one person's attendance for one day. UNIQUE(user_id, date) lets us use
    INSERT ... ON CONFLICT DO UPDATE (an "upsert"); the CHECK constraints still validate the row.
    """
    ensure_can_view(db, user, data.user_id)
    try:
        row = db.execute(text("""
            INSERT INTO attendance (user_id, date, check_in, check_out, status)
            VALUES (:user_id, :date, :check_in, :check_out, :status)
            ON CONFLICT (user_id, date)
            DO UPDATE SET check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, status = EXCLUDED.status
            RETURNING attendance_id
        """), data.model_dump()).first()
        db.commit()
    except DBAPIError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=db_error_message(e))
    return db.get(Attendance, row[0])
