from datetime import date , datetime
from typing import Optional

from pydantic import BaseModel


class UserResponse(BaseModel):
    user_id: int
    first_name: str
    last_name: str
    email: str
    role_id: int
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    joining_date: date
    status: str
    salary: Optional[float] = None

    class Config:
        from_attributes = True
class DepartmentResponse(BaseModel):
    department_id: int
    department_name: str
    budget: Optional[float] = None

    class Config:
        from_attributes = True
class AttendanceResponse(BaseModel):
    attendance_id: int
    user_id: int
    date: date
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    status: str

    class Config:
        from_attributes = True