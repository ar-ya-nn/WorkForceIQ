from sqlalchemy import Column, Integer, String, Date, DateTime, Numeric, Text
from backend.app.database import Base


class Role(Base):
    __tablename__ = "roles"

    role_id = Column(Integer, primary_key=True)
    role_name = Column(String, nullable=False)


class Department(Base):
    __tablename__ = "departments"

    department_id = Column(Integer, primary_key=True)
    department_name = Column(String, nullable=False)
    budget = Column(Numeric)


class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role_id = Column(Integer, nullable=False)
    department_id = Column(Integer)
    manager_id = Column(Integer)
    joining_date = Column(Date, nullable=False)
    status = Column(String, nullable=False)
    salary = Column(Numeric)


class Attendance(Base):
    __tablename__ = "attendance"

    attendance_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    date = Column(Date, nullable=False)
    check_in = Column(DateTime)
    check_out = Column(DateTime)
    status = Column(String, nullable=False)


class LeaveType(Base):
    __tablename__ = "leave_types"

    leave_type_id = Column(Integer, primary_key=True)
    type_name = Column(String, nullable=False)
    max_days = Column(Integer, nullable=False)


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    leave_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    leave_type_id = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String, nullable=False)


class PerformanceReview(Base):
    __tablename__ = "performance_reviews"

    review_id = Column(Integer, primary_key=True)
    user_id = Column(Integer, nullable=False)
    reviewer_id = Column(Integer, nullable=False)
    rating = Column(Integer, nullable=False)
    feedback = Column(Text)
    review_date = Column(Date, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    log_id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    action = Column(String, nullable=False)
    timestamp = Column(DateTime)