from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from backend.app.auth import ADMIN, CurrentUser, get_current_user, require_roles
from backend.app.database import db_error_message, get_db
from backend.app.models import Department, User
from backend.app.schemas import DepartmentCreate, DepartmentResponse, DepartmentUpdate

router = APIRouter(prefix="/departments", tags=["Departments"], dependencies=[Depends(get_current_user)])


def _commit(db: Session):
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=db_error_message(e))
    except DBAPIError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=db_error_message(e))


@router.get("/", response_model=List[DepartmentResponse])
def list_departments(db: Session = Depends(get_db)):
    return db.query(Department).order_by(Department.department_id).all()


@router.get("/{department_id}", response_model=DepartmentResponse)
def get_department(department_id: int, db: Session = Depends(get_db)):
    department = db.get(Department, department_id)
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")
    return department


@router.post("/", response_model=DepartmentResponse, status_code=201)
def create_department(data: DepartmentCreate, db: Session = Depends(get_db),
                      _: CurrentUser = Depends(require_roles(ADMIN))):
    department = Department(**data.model_dump())
    db.add(department)
    _commit(db)                       # UNIQUE(department_name) turns a duplicate into a 409
    db.refresh(department)
    return department


@router.patch("/{department_id}", response_model=DepartmentResponse)
def update_department(department_id: int, data: DepartmentUpdate, db: Session = Depends(get_db),
                      _: CurrentUser = Depends(require_roles(ADMIN))):
    department = db.get(Department, department_id)
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(department, field, value)
    _commit(db)
    db.refresh(department)
    return department


@router.delete("/{department_id}", status_code=204)
def delete_department(department_id: int, db: Session = Depends(get_db),
                      _: CurrentUser = Depends(require_roles(ADMIN))):
    department = db.get(Department, department_id)
    if department is None:
        raise HTTPException(status_code=404, detail="Department not found")
    members = db.query(func.count(User.user_id)).filter(User.department_id == department_id).scalar()
    if members:
        raise HTTPException(status_code=409,
                            detail=f"{members} people are still in this department. Move them first.")
    db.delete(department)
    _commit(db)
