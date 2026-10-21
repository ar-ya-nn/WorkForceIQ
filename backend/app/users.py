from typing import List, Literal, Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from backend.app.auth import (ADMIN, MANAGER, CurrentUser, department_scope, ensure_can_view,
                              get_current_user, require_roles)
from backend.app.database import db_error_message, get_db
from backend.app.models import PerformanceReview, User
from backend.app.schemas import Page, ReviewResponse, UserCreate, UserResponse, UserUpdate

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/", response_model=Page[UserResponse])
def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    department_id: Optional[int] = None,
    role_id: Optional[int] = None,
    status: Optional[Literal["ACTIVE", "EXITED"]] = None,
    search: Optional[str] = Query(None, description="Matches first name, last name or email"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_roles(ADMIN, MANAGER)),
):
    scope = department_scope(user)
    if scope is not None:              # managers only ever see their own department
        department_id = scope
    query = db.query(User)
    if department_id is not None:
        query = query.filter(User.department_id == department_id)
    if role_id is not None:
        query = query.filter(User.role_id == role_id)
    if status is not None:
        query = query.filter(User.status == status)
    if search:
        pattern = f"%{search}%"
        query = query.filter(or_(User.first_name.ilike(pattern),
                                 User.last_name.ilike(pattern),
                                 User.email.ilike(pattern)))

    total = query.count()
    users = query.order_by(User.user_id).offset(skip).limit(limit).all()
    return {"total": total, "skip": skip, "limit": limit,
            "items": [UserResponse.model_validate(u) for u in users]}


@router.get("/me")
def my_details(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    """The logged-in user's own details. Every role can use this."""
    row = db.execute(text("SELECT * FROM v_employee_details WHERE user_id = :id"),
                     {"id": user.user_id}).mappings().first()
    return dict(row) if row else {}


@router.get("/{user_id}")
def get_user_details(user_id: int, db: Session = Depends(get_db),
                     user: CurrentUser = Depends(get_current_user)):
    """Full employee details (user + department + role + HR profile) from v_employee_details."""
    ensure_can_view(db, user, user_id)
    row = db.execute(text("SELECT * FROM v_employee_details WHERE user_id = :id"),
                     {"id": user_id}).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)


@router.get("/{user_id}/reviews", response_model=List[ReviewResponse])
def get_user_reviews(user_id: int, db: Session = Depends(get_db),
                     user: CurrentUser = Depends(get_current_user)):
    ensure_can_view(db, user, user_id)
    return (db.query(PerformanceReview)
              .filter(PerformanceReview.user_id == user_id)
              .order_by(PerformanceReview.review_date.desc())
              .all())


@router.post("/", response_model=UserResponse, status_code=201)
def create_user(data: UserCreate, db: Session = Depends(get_db),
                _: CurrentUser = Depends(require_roles(ADMIN))):
    password_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
    fields = data.model_dump(exclude={"password"})
    fields["email"] = fields["email"].lower()
    user = User(**fields, password_hash=password_hash)
    db.add(user)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=db_error_message(e))
    except DBAPIError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=db_error_message(e))
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db),
                _: CurrentUser = Depends(require_roles(ADMIN))):
    """Every change here is recorded in audit_logs by the trg_audit_users trigger."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    try:
        db.commit()
    except DBAPIError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=db_error_message(e))
    db.refresh(user)
    return user
