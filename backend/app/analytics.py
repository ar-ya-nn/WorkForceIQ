from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import ADMIN, MANAGER, require_roles
from backend.app.database import get_db

# Organisation-wide aggregates (no individual data): admins and managers only.
router = APIRouter(prefix="/analytics", tags=["Analytics"],
                   dependencies=[Depends(require_roles(ADMIN, MANAGER))])

# Columns allowed for the attrition breakdown. Using a fixed whitelist means the
# column name never comes straight from the user, so it can't be used for SQL injection.
ATTRITION_FACTORS = {
    "overtime": "overtime",
    "job_satisfaction": "job_satisfaction",
    "environment_satisfaction": "environment_satisfaction",
    "work_life_balance": "work_life_balance",
    "job_level": "job_level",
    "job_involvement": "job_involvement",
    "business_travel": "business_travel",
    "marital_status": "marital_status",
    "stock_option_level": "stock_option_level",
    "gender": "gender",
}


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    """Headline numbers for the dashboard."""
    row = db.execute(text("""
        SELECT
            COUNT(*)                                              AS total_employees,
            COUNT(*) FILTER (WHERE u.status = 'ACTIVE')           AS active_employees,
            COUNT(*) FILTER (WHERE p.attrition)                   AS employees_left,
            ROUND(100.0 * AVG(p.attrition::INT), 2)               AS attrition_rate_pct,
            ROUND(AVG(p.monthly_income), 2)                       AS avg_monthly_income,
            ROUND(100.0 * AVG(p.overtime::INT), 2)                AS overtime_pct,
            ROUND(AVG(p.job_satisfaction), 2)                     AS avg_job_satisfaction,
            (SELECT COUNT(*) FROM leave_requests WHERE status = 'PENDING') AS pending_leave_requests,
            (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE'))
                          / NULLIF(COUNT(*), 0), 2)
             FROM attendance
             WHERE date BETWEEN (SELECT MAX(date) FROM attendance WHERE status <> 'ON_LEAVE') - 30
                            AND (SELECT MAX(date) FROM attendance WHERE status <> 'ON_LEAVE')) AS attendance_rate_30d_pct
        FROM users u
        JOIN employee_profiles p ON p.user_id = u.user_id
    """)).mappings().first()
    return dict(row)


@router.get("/attendance-trend")
def attendance_trend(db: Session = Depends(get_db)):
    """Daily attendance rate over the last 30 working days of recorded attendance."""
    rows = db.execute(text("""
        SELECT date,
               COUNT(*)                                                AS employees,
               COUNT(*) FILTER (WHERE status = 'LATE')                 AS late,
               COUNT(*) FILTER (WHERE status = 'ABSENT')               AS absent,
               COUNT(*) FILTER (WHERE status = 'ON_LEAVE')             AS on_leave,
               ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE'))
                     / NULLIF(COUNT(*), 0), 2)                         AS attendance_rate_pct
        FROM attendance
        WHERE date BETWEEN (SELECT MAX(date) FROM attendance WHERE status <> 'ON_LEAVE') - 45
                       AND (SELECT MAX(date) FROM attendance WHERE status <> 'ON_LEAVE')
        GROUP BY date
        ORDER BY date
    """)).mappings().all()
    return [dict(r) for r in rows]


@router.get("/departments")
def department_summary(db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT * FROM v_department_summary ORDER BY department_name")).mappings().all()
    return [dict(r) for r in rows]


@router.get("/attrition/job-role")
def attrition_by_job_role(db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT * FROM v_attrition_by_job_role ORDER BY attrition_rate_pct DESC")).mappings().all()
    return [dict(r) for r in rows]


@router.get("/attrition/by/{factor}")
def attrition_by_factor(factor: Literal[tuple(ATTRITION_FACTORS)], db: Session = Depends(get_db)):
    """Attrition rate grouped by one HR factor, e.g. /analytics/attrition/by/overtime"""
    column = ATTRITION_FACTORS[factor]
    rows = db.execute(text(f"""
        SELECT {column}                                AS value,
               COUNT(*)                                AS total_employees,
               COUNT(*) FILTER (WHERE attrition)       AS employees_left,
               ROUND(100.0 * AVG(attrition::INT), 2)   AS attrition_rate_pct
        FROM employee_profiles
        GROUP BY {column}
        ORDER BY {column}
    """)).mappings().all()
    return {"factor": factor, "groups": [dict(r) for r in rows]}
