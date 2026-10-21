from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from backend.app.auth import (ADMIN, EMPLOYEE, MANAGER, CurrentUser, department_scope,
                              ensure_can_view, get_current_user, require_roles)
from backend.app.database import db_error_message, get_db
from backend.app.models import LeaveRequest, LeaveType, User
from backend.app.schemas import LeaveCreate, LeaveListItem, LeaveResponse, LeaveTypeResponse, Page

router = APIRouter(prefix="/leave", tags=["Leave"])


@router.get("/types", response_model=List[LeaveTypeResponse])
def list_leave_types(db: Session = Depends(get_db), _: CurrentUser = Depends(get_current_user)):
    return db.query(LeaveType).order_by(LeaveType.leave_type_id).all()


@router.get("/", response_model=Page[LeaveListItem])
def list_leave_requests(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    user_id: Optional[int] = None,
    status: Optional[Literal["PENDING", "APPROVED", "REJECTED"]] = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Admin: all requests. Manager: their department. Employee: only their own."""
    if user.role == EMPLOYEE:
        user_id = user.user_id

    query = (db.query(LeaveRequest, User.first_name, User.last_name)
               .join(User, User.user_id == LeaveRequest.user_id))
    if user.role == MANAGER:
        query = query.filter(User.department_id == department_scope(user))
    if user_id is not None:
        query = query.filter(LeaveRequest.user_id == user_id)
    if status is not None:
        query = query.filter(LeaveRequest.status == status)

    total = query.count()
    rows = (query.order_by(LeaveRequest.start_date.desc(), LeaveRequest.leave_id.desc())
                 .offset(skip).limit(limit).all())
    items = [{**LeaveResponse.model_validate(leave).model_dump(), "employee_name": f"{first} {last}"}
             for leave, first, last in rows]
    return {"total": total, "skip": skip, "limit": limit, "items": items}


@router.get("/balance/{user_id}")
def leave_balance(user_id: int, db: Session = Depends(get_db),
                  user: CurrentUser = Depends(get_current_user)):
    """Days taken / pending / remaining per leave type this year (v_leave_balance)."""
    ensure_can_view(db, user, user_id)
    rows = db.execute(text("SELECT * FROM v_leave_balance WHERE user_id = :id ORDER BY type_name"),
                      {"id": user_id}).mappings().all()
    if not rows:
        raise HTTPException(status_code=404, detail="No active user with that id")
    return [dict(r) for r in rows]


@router.post("/", response_model=LeaveResponse, status_code=201)
def apply_for_leave(data: LeaveCreate, db: Session = Depends(get_db),
                    user: CurrentUser = Depends(get_current_user)):
    """
    Employees can only apply for themselves; managers for themselves or their department;
    admins for anyone. The trg_validate_leave trigger then rejects overlaps or going over the limit.
    """
    target_id = user.user_id if (user.role == EMPLOYEE or data.user_id is None) else data.user_id
    ensure_can_view(db, user, target_id)

    leave = LeaveRequest(**data.model_dump(exclude={"user_id"}), user_id=target_id)
    db.add(leave)
    try:
        db.commit()
    except DBAPIError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=db_error_message(e))
    db.refresh(leave)
    return leave


def _check_can_decide(db: Session, user: CurrentUser, leave_id: int) -> LeaveRequest:
    leave = db.get(LeaveRequest, leave_id)
    if leave is None:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if leave.user_id == user.user_id:
        raise HTTPException(status_code=403, detail="You can't approve or reject your own leave")
    ensure_can_view(db, user, leave.user_id)        # managers: own department only
    return leave


@router.post("/{leave_id}/approve", response_model=LeaveResponse)
def approve_leave(leave_id: int, db: Session = Depends(get_db),
                  user: CurrentUser = Depends(require_roles(ADMIN, MANAGER))):
    """
    Calls the approve_leave stored procedure. It updates the request AND marks attendance
    as ON_LEAVE in one transaction: if anything fails, both changes are rolled back.
    The approver is always the logged-in user (taken from the token, not the request body).
    """
    _check_can_decide(db, user, leave_id)
    try:
        db.execute(text("CALL approve_leave(:leave_id, :approver_id)"),
                   {"leave_id": leave_id, "approver_id": user.user_id})
        db.commit()
    except DBAPIError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=db_error_message(e))
    db.expire_all()
    return db.get(LeaveRequest, leave_id)


@router.post("/{leave_id}/reject", response_model=LeaveResponse)
def reject_leave(leave_id: int, db: Session = Depends(get_db),
                 user: CurrentUser = Depends(require_roles(ADMIN, MANAGER))):
    _check_can_decide(db, user, leave_id)
    updated = db.execute(text("""
        UPDATE leave_requests
        SET status = 'REJECTED', approved_by = :approver_id
        WHERE leave_id = :leave_id AND status = 'PENDING'
        RETURNING leave_id
    """), {"leave_id": leave_id, "approver_id": user.user_id}).first()

    if updated is None:
        db.rollback()
        raise HTTPException(status_code=400, detail="Only PENDING requests can be rejected")

    db.commit()
    db.expire_all()
    return db.get(LeaveRequest, leave_id)
