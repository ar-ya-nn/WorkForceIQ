from sqlalchemy import (BigInteger, Boolean, Column, Date, DateTime, ForeignKey, Integer,
                        Numeric, SmallInteger, String, Text, text)
from sqlalchemy.dialects.postgresql import JSONB

from backend.app.database import Base


class Role(Base):
    __tablename__ = "roles"

    role_id = Column(SmallInteger, primary_key=True)
    role_name = Column(String(20), nullable=False, unique=True)


class Department(Base):
    __tablename__ = "departments"

    department_id = Column(Integer, primary_key=True)
    department_name = Column(String(60), nullable=False, unique=True)
    budget = Column(Numeric(14, 2))


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True)
    first_name = Column(String(50), nullable=False)
    last_name = Column(String(50), nullable=False)
    email = Column(String(120), nullable=False, unique=True)
    password_hash = Column(String(100), nullable=False)
    role_id = Column(SmallInteger, ForeignKey("roles.role_id"), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.department_id"))
    manager_id = Column(Integer, ForeignKey("users.user_id"))
    joining_date = Column(Date, nullable=False, server_default=text("CURRENT_DATE"))
    status = Column(String(10), nullable=False, server_default=text("'ACTIVE'"))
    salary = Column(Numeric(12, 2))


class EmployeeProfile(Base):
    __tablename__ = "employee_profiles"

    user_id = Column(Integer, ForeignKey("users.user_id"), primary_key=True)
    ibm_employee_number = Column(Integer, unique=True)
    age = Column(SmallInteger, nullable=False)
    gender = Column(String(10), nullable=False)
    marital_status = Column(String(10), nullable=False)
    education = Column(SmallInteger)
    education_field = Column(String(30))
    job_role = Column(String(40), nullable=False)
    job_level = Column(SmallInteger, nullable=False)
    business_travel = Column(String(20))
    distance_from_home = Column(SmallInteger)
    monthly_income = Column(Numeric(10, 2), nullable=False)
    percent_salary_hike = Column(SmallInteger)
    stock_option_level = Column(SmallInteger)
    overtime = Column(Boolean, nullable=False)
    job_satisfaction = Column(SmallInteger)
    environment_satisfaction = Column(SmallInteger)
    relationship_satisfaction = Column(SmallInteger)
    job_involvement = Column(SmallInteger)
    work_life_balance = Column(SmallInteger)
    num_companies_worked = Column(SmallInteger)
    total_working_years = Column(SmallInteger)
    training_times_last_year = Column(SmallInteger)
    years_at_company = Column(SmallInteger)
    years_in_current_role = Column(SmallInteger)
    years_since_last_promotion = Column(SmallInteger)
    years_with_curr_manager = Column(SmallInteger)
    attrition = Column(Boolean, nullable=False)


class Attendance(Base):
    __tablename__ = "attendance"

    attendance_id = Column(BigInteger, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    date = Column(Date, nullable=False)
    check_in = Column(DateTime)
    check_out = Column(DateTime)
    status = Column(String(10), nullable=False)


class LeaveType(Base):
    __tablename__ = "leave_types"

    leave_type_id = Column(Integer, primary_key=True)
    type_name = Column(String(10), nullable=False, unique=True)
    max_days = Column(SmallInteger, nullable=False)


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    leave_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    leave_type_id = Column(Integer, ForeignKey("leave_types.leave_type_id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    reason = Column(Text)
    status = Column(String(10), nullable=False, server_default=text("'PENDING'"))
    approved_by = Column(Integer, ForeignKey("users.user_id"))
    requested_at = Column(DateTime, nullable=False, server_default=text("NOW()"))


class PerformanceReview(Base):
    __tablename__ = "performance_reviews"

    review_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    reviewer_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    rating = Column(SmallInteger, nullable=False)
    feedback = Column(Text)
    review_date = Column(Date, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id = Column(BigInteger, primary_key=True)
    table_name = Column(String(40), nullable=False)
    record_id = Column(BigInteger)
    user_id = Column(Integer)
    action = Column(String(10), nullable=False)
    old_data = Column(JSONB)
    new_data = Column(JSONB)
    changed_by = Column(Text, nullable=False)
    timestamp = Column(DateTime, nullable=False, server_default=text("NOW()"))
