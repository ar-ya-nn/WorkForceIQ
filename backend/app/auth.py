"""
Authentication and role-based access control (RBAC).

- POST /auth/login checks the email + bcrypt password hash stored in the users table
  and returns a signed JWT token that expires after a few hours.
- Every protected endpoint uses get_current_user / require_roles to read that token.
- Managers are limited to their own department, employees to their own records.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Department, User
from backend.app.schemas import PasswordChange

JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me")
JWT_ALGORITHM = "HS256"
TOKEN_HOURS = 8

ADMIN, MANAGER, EMPLOYEE = "ADMIN", "MANAGER", "EMPLOYEE"
ROLE_NAMES = {1: ADMIN, 2: MANAGER, 3: EMPLOYEE}

router = APIRouter(prefix="/auth", tags=["Auth"])
bearer = HTTPBearer(auto_error=False)


class GoogleLoginRequest(BaseModel):
    credential: str          # the ID token Google gives the browser


class LoginRequest(BaseModel):
    email: str
    password: str


class CurrentUser(BaseModel):
    user_id: int
    name: str
    email: str
    role: str
    department_id: Optional[int] = None
    department_name: Optional[str] = None

    @property
    def is_admin(self) -> bool:
        return self.role == ADMIN

    @property
    def is_manager(self) -> bool:
        return self.role == MANAGER


def _to_current_user(user: User, db: Session) -> CurrentUser:
    department = db.get(Department, user.department_id) if user.department_id else None
    return CurrentUser(
        user_id=user.user_id,
        name=f"{user.first_name} {user.last_name}",
        email=user.email,
        role=ROLE_NAMES.get(user.role_id, EMPLOYEE),
        department_id=user.department_id,
        department_name=department.department_name if department else None,
    )


def _create_token(user: User) -> str:
    payload = {
        "sub": str(user.user_id),
        "role": ROLE_NAMES.get(user.role_id, EMPLOYEE),
        "exp": datetime.now(timezone.utc) + timedelta(hours=TOKEN_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# ---------------------------------------------------------------------------
# Dependencies used by the other routers
# ---------------------------------------------------------------------------

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
    db: Session = Depends(get_db),
) -> CurrentUser:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Please log in again",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized

    # Re-read the user every time, so a role change or deactivation applies immediately.
    user = db.get(User, user_id)
    if user is None or user.status != "ACTIVE":
        raise unauthorized
    return _to_current_user(user, db)


def require_roles(*roles: str):
    """Dependency factory: only lets the listed roles through, everyone else gets 403."""
    def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail="You don't have permission to do this")
        return user
    return checker


def department_scope(user: CurrentUser) -> Optional[int]:
    """None means 'all departments' (admin); otherwise the only department this user may see."""
    return None if user.is_admin else user.department_id


def ensure_can_view(db: Session, user: CurrentUser, target_user_id: int) -> User:
    """Admin: anyone. Manager: people in their own department. Employee: only themselves."""
    target = db.get(User, target_user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.is_admin or target.user_id == user.user_id:
        return target
    if user.is_manager and target.department_id == user.department_id:
        return target
    raise HTTPException(status_code=403, detail="You can only view people in your own area")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.strip().lower()).first()
    password_ok = (
        user is not None
        and bcrypt.checkpw(data.password.encode(), user.password_hash.encode())
    )
    # Same message for a wrong email or a wrong password, so attackers can't probe for accounts.
    if not password_ok or user.status != "ACTIVE":
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return {"access_token": _create_token(user), "token_type": "bearer", "user": _to_current_user(user, db)}


@router.get("/config")
def auth_config():
    """Tells the login page whether "Sign in with Google" is available (and its public client ID)."""
    return {"google_client_id": os.getenv("GOOGLE_CLIENT_ID") or None}


@router.post("/google")
def google_login(data: GoogleLoginRequest, db: Session = Depends(get_db)):
    """
    Google single sign-on. Google's signed ID token is verified on the server (signature, expiry,
    audience = our client ID, verified email). Then the matching WorkForceIQ account is signed in.
    Nobody can create an account this way: an admin must have added their email first.
    """
    client_id = os.getenv("GOOGLE_CLIENT_ID")
    if not client_id:
        raise HTTPException(status_code=404, detail="Google sign-in is not set up on this server")
    try:
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token
        info = id_token.verify_oauth2_token(data.credential, google_requests.Request(), client_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Google sign-in failed. Please try again.")
    if not info.get("email_verified"):
        raise HTTPException(status_code=401, detail="Your Google email address isn't verified")

    email = info["email"].lower()
    user = db.query(User).filter(User.email == email).first()
    if user is None or user.status != "ACTIVE":
        raise HTTPException(status_code=403,
                            detail=f"No active WorkForceIQ account uses {email}. Ask your administrator to add it.")
    return {"access_token": _create_token(user), "token_type": "bearer", "user": _to_current_user(user, db)}


@router.get("/me", response_model=CurrentUser)
def me(user: CurrentUser = Depends(get_current_user)):
    return user


@router.post("/change-password", status_code=204)
def change_password(data: PasswordChange, db: Session = Depends(get_db),
                    current: CurrentUser = Depends(get_current_user)):
    """Any logged-in user can change their own password (they must know the current one)."""
    user = db.get(User, current.user_id)
    if not bcrypt.checkpw(data.current_password.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = bcrypt.hashpw(data.new_password.encode(), bcrypt.gensalt()).decode()
    db.commit()
