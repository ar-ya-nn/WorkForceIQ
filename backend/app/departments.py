from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Department
from backend.app.schemas import DepartmentResponse


router = APIRouter(
    prefix="/departments",
    tags=["Departments"]
)


@router.get("/", response_model=List[DepartmentResponse])
def get_departments(db: Session = Depends(get_db)):
    departments = db.query(Department).all()

    return departments