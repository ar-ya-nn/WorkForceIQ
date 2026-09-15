from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.models import Attendance
from backend.app.schemas import AttendanceResponse


router = APIRouter(
    prefix="/attendance",
    tags=["Attendance"]
)


@router.get("/", response_model=List[AttendanceResponse])
def get_attendance(db: Session = Depends(get_db)):
    attendance_records = db.query(Attendance).all()
    return attendance_records
