from typing import List, Literal, Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, text
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from backend.app.auth import (ADMIN, MANAGER, CurrentUser, department_scope, ensure_can_view,
                              get_current_user, require_roles)
from backend.app.database import db_error_message, get_db
from backend.app.models import EmployeeProfile, PerformanceReview, User
from backend.app.schemas import (PROFILE_REQUIRED, Page, PasswordReset, ProfileFields, ReviewCreate,
                                 ReviewResponse, UserCreate, UserResponse, UserUpdate)

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


def _commit(db: Session):
    """Commit, turning database errors (constraints, triggers) into readable 4xx responses."""
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=db_error_message(e))
    except DBAPIError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=db_error_message(e))


def _check_profile_complete(fields: dict):
    missing = [f for f in PROFILE_REQUIRED if fields.get(f) is None]
    if missing:
        raise HTTPException(status_code=422, detail=f"Profile needs: {', '.join(missing)}")


@router.post("/", response_model=UserResponse, status_code=201)
def create_user(data: UserCreate, db: Session = Depends(get_db),
                _: CurrentUser = Depends(require_roles(ADMIN))):
    """Creates the user and (optionally) their HR profile in ONE transaction: both or neither."""
    password_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
    fields = data.model_dump(exclude={"password", "profile"})
    fields["email"] = fields["email"].lower()
    user = User(**fields, password_hash=password_hash)
    db.add(user)

    if data.profile is not None:
        profile = data.profile.model_dump(exclude_none=True)
        _check_profile_complete(profile)
        profile.setdefault("overtime", False)
        try:
            db.flush()                        # gets the new user_id without committing yet
        except DBAPIError as e:
            db.rollback()
            raise HTTPException(status_code=409, detail=db_error_message(e))
        db.add(EmployeeProfile(user_id=user.user_id, attrition=False, **profile))

    _commit(db)
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db),
                admin: CurrentUser = Depends(require_roles(ADMIN))):
    """Every change here is recorded in audit_logs by the trg_audit_users trigger."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    changes = data.model_dump(exclude_unset=True)
    if user_id == admin.user_id and (changes.get("status") == "EXITED" or changes.get("role_id", 1) != 1):
        raise HTTPException(status_code=400, detail="You can't deactivate or demote your own admin account")
    if "email" in changes and changes["email"]:
        changes["email"] = changes["email"].lower()
    for field, value in changes.items():
        setattr(user, field, value)
    _commit(db)
    db.refresh(user)
    return user


@router.patch("/{user_id}/profile")
def update_profile(user_id: int, data: ProfileFields, db: Session = Depends(get_db),
                   _: CurrentUser = Depends(require_roles(ADMIN))):
    """Edit HR attributes. Creates the profile row if this person doesn't have one yet."""
    if db.get(User, user_id) is None:
        raise HTTPException(status_code=404, detail="User not found")
    changes = data.model_dump(exclude_unset=True)
    profile = db.get(EmployeeProfile, user_id)
    if profile is None:
        _check_profile_complete(changes)
        changes.setdefault("overtime", False)
        db.add(EmployeeProfile(user_id=user_id, attrition=False, **changes))
    else:
        for field, value in changes.items():
            setattr(profile, field, value)
    _commit(db)
    row = db.execute(text("SELECT * FROM v_employee_details WHERE user_id = :id"), {"id": user_id}).mappings().first()
    return dict(row)


@router.post("/{user_id}/reset-password", status_code=204)
def reset_password(user_id: int, data: PasswordReset, db: Session = Depends(get_db),
                   _: CurrentUser = Depends(require_roles(ADMIN))):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = bcrypt.hashpw(data.new_password.encode(), bcrypt.gensalt()).decode()
    _commit(db)


@router.post("/{user_id}/reviews", response_model=ReviewResponse, status_code=201)
def add_review(user_id: int, data: ReviewCreate, db: Session = Depends(get_db),
               user: CurrentUser = Depends(require_roles(ADMIN, MANAGER))):
    """Admins review anyone, managers their own department. The reviewer is the logged-in user."""
    ensure_can_view(db, user, user_id)
    if user_id == user.user_id:
        raise HTTPException(status_code=400, detail="You can't review yourself")
    review = PerformanceReview(user_id=user_id, reviewer_id=user.user_id, **data.model_dump())
    db.add(review)
    _commit(db)
    db.refresh(review)
    return review
