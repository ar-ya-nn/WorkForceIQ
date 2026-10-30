
from datetime import date, datetime
from typing import Any, Generic, List, Literal, Optional, TypeVar

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

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


class ProfileFields(BaseModel):
    """HR attributes stored in employee_profiles. Ranges mirror the CHECK constraints in the database."""
    age: Optional[int] = Field(default=None, ge=18, le=65)
    gender: Optional[Literal["Male", "Female"]] = None
    marital_status: Optional[Literal["Single", "Married", "Divorced"]] = None
    education: Optional[int] = Field(default=None, ge=1, le=5)
    education_field: Optional[str] = Field(default=None, max_length=30)
    job_role: Optional[str] = Field(default=None, max_length=40)
    job_level: Optional[int] = Field(default=None, ge=1, le=5)
    business_travel: Optional[Literal["Non-Travel", "Travel_Rarely", "Travel_Frequently"]] = None
    distance_from_home: Optional[int] = Field(default=None, ge=0)
    monthly_income: Optional[float] = Field(default=None, gt=0)
    percent_salary_hike: Optional[int] = Field(default=None, ge=0, le=100)
    stock_option_level: Optional[int] = Field(default=None, ge=0, le=3)
    overtime: Optional[bool] = None
    job_satisfaction: Optional[int] = Field(default=None, ge=1, le=4)
    environment_satisfaction: Optional[int] = Field(default=None, ge=1, le=4)
    relationship_satisfaction: Optional[int] = Field(default=None, ge=1, le=4)
    job_involvement: Optional[int] = Field(default=None, ge=1, le=4)
    work_life_balance: Optional[int] = Field(default=None, ge=1, le=4)
    num_companies_worked: Optional[int] = Field(default=None, ge=0)
    total_working_years: Optional[int] = Field(default=None, ge=0)
    training_times_last_year: Optional[int] = Field(default=None, ge=0)
    years_at_company: Optional[int] = Field(default=None, ge=0)
    years_in_current_role: Optional[int] = Field(default=None, ge=0)
    years_since_last_promotion: Optional[int] = Field(default=None, ge=0)
    years_with_curr_manager: Optional[int] = Field(default=None, ge=0)


# Fields the database requires when a profile row is created
PROFILE_REQUIRED = (
    "age",
    "gender",
    "marital_status",
    "job_role",
    "job_level",
    "monthly_income",
)


class UserCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8)
    role_id: Literal[1, 2, 3, 4] = 3
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    salary: Optional[float] = Field(default=None, gt=0)
    profile: Optional[ProfileFields] = None

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_names(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Name cannot be empty or whitespace")
        return value


class UserUpdate(BaseModel):
    """Only the fields sent are changed."""
    first_name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    last_name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    email: Optional[EmailStr] = None
    role_id: Optional[Literal[1, 2, 3, 4]] = None
    department_id: Optional[int] = None
    manager_id: Optional[int] = None
    salary: Optional[float] = Field(default=None, gt=0)
    status: Optional[Literal["ACTIVE", "EXITED"]] = None

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_names(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value

        value = value.strip()
        if not value:
            raise ValueError("Name cannot be empty or whitespace")
        return value


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    feedback: Optional[str] = Field(default=None, max_length=1000)
    review_date: date


# ---------- Departments ----------

class DepartmentCreate(BaseModel):
    department_name: str = Field(min_length=1, max_length=60)
    budget: Optional[float] = Field(default=None, ge=0)


class DepartmentUpdate(BaseModel):
    department_name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    budget: Optional[float] = Field(default=None, ge=0)


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


class AttendanceUpsert(BaseModel):
    """Create or correct one day's attendance for one person."""
    user_id: int
    date: date
    status: Literal["PRESENT", "LATE", "ABSENT", "ON_LEAVE"]
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None

    @model_validator(mode="after")
    def check_times(self):
        present = self.status in ("PRESENT", "LATE")

        if present and self.check_in is None:
            raise ValueError("PRESENT and LATE need a check-in time")

        if not present and (self.check_in is not None or self.check_out is not None):
            raise ValueError("ABSENT and ON_LEAVE can't have check-in or check-out times")

        if (
            self.check_in is not None
            and self.check_out is not None
            and self.check_out <= self.check_in
        ):
            raise ValueError("check-out must be after check-in")

        return self


# ---------- Leave ----------

class LeaveTypeCreate(BaseModel):
    type_name: str = Field(min_length=1, max_length=10)
    max_days: int = Field(gt=0, le=365)


class LeaveTypeUpdate(BaseModel):
    type_name: Optional[str] = Field(default=None, min_length=1, max_length=10)
    max_days: Optional[int] = Field(default=None, gt=0, le=365)


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
    user_id: Optional[int] = None
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
