from datetime import date, datetime
from typing import Any, Generic, List, Literal, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    """Wrapper for every list endpoint, so the frontend knows the total for pagination."""
    total: int
    skip: int
    limit: int
    items: List[T]


# ---------- Users ----------

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

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


class UserCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8)
    role_id: Literal[1, 2, 3] = 3
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    salary: Optional[float] = Field(default=None, gt=0)


class UserUpdate(BaseModel):
    """Only the fields sent are changed."""
    role_id: Optional[Literal[1, 2, 3]] = None
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    salary: Optional[float] = Field(default=None, gt=0)
    status: Optional[Literal["ACTIVE", "EXITED"]] = None


# ---------- Departments ----------

class DepartmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    department_id: int
    department_name: str
    budget: Optional[float] = None


# ---------- Attendance ----------

class AttendanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    attendance_id: int
    user_id: int
    date: date
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    status: str


# ---------- Leave ----------

class LeaveTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    leave_type_id: int
    type_name: str
    max_days: int


class LeaveResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    leave_id: int
    user_id: int
    leave_type_id: int
    start_date: date
    end_date: date
    reason: Optional[str] = None
    status: str
    approved_by: Optional[int] = None
    requested_at: datetime


class LeaveListItem(LeaveResponse):
    employee_name: str


class LeaveCreate(BaseModel):
    user_id: Optional[int] = None      # left out = "for myself"; employees are always forced to themselves
    leave_type_id: int
    start_date: date
    end_date: date
    reason: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date cannot be before start_date")
        return self


# ---------- Reviews & audit ----------

class ReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    review_id: int
    user_id: int
    reviewer_id: int
    rating: int
    feedback: Optional[str] = None
    review_date: date


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    log_id: int
    table_name: str
    record_id: Optional[int] = None
    user_id: Optional[int] = None
    action: str
    old_data: Optional[Any] = None
    new_data: Optional[Any] = None
    changed_by: str
    timestamp: datetime
