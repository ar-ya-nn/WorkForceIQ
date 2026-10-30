"""
The Overview "insight briefing": instead of a wall of numbers, a few plain-English sentences that say
what is happening, what drives it, who to focus on and what needs doing, computed from live
SQL analytics and the attrition model. Every sentence is built from a query result, so the
wording always matches the data.
"""

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from backend.app.auth import ADMIN, MANAGER, VIEWER, CurrentUser, require_roles
from backend.app.database import get_db

router = APIRouter(prefix="/analytics", tags=["Analytics"])

ON_LEAVE_AWARE_DAY = "(SELECT MAX(date) FROM attendance WHERE status <> 'ON_LEAVE')"
CATEGORIES = ["department_name", "job_role", "business_travel", "marital_status", "education_field", "gender"]


def one_in(pct):
    """16.1 -> 'about 1 in 6'"""
    if not pct:
        return "almost nobody"
    n = round(100 / float(pct))
    return "about half" if n <= 2 else f"about 1 in {n}"


def pretty_factor(name):
    for c in CATEGORIES:
        if name.startswith(c + "_"):
            value = name[len(c) + 1:].replace("_", " ")
            label = c.replace("_name", "").replace("_", " ")
            return f"{label} \u201c{value}\u201d"
    return name.replace("_", " ")


def _rows(db, sql, params=None):
    return [dict(r) for r in db.execute(text(sql), params or {}).mappings().all()]


@router.get("/briefing")
def briefing(db: Session = Depends(get_db), user: CurrentUser = Depends(require_roles(ADMIN, MANAGER, VIEWER))):
    o = _rows(db, """
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE u.status = 'ACTIVE') AS active,
               COUNT(*) FILTER (WHERE p.attrition) AS left_count,
               ROUND(100.0 * AVG(p.attrition::INT), 1) AS attrition_pct
        FROM users u JOIN employee_profiles p ON p.user_id = u.user_id
    """)[0]

    big_picture = [
        f"Of the {o['total']:,} people in the records, {o['left_count']:,} have left, "
        f"{one_in(o['attrition_pct'])} ({o['attrition_pct']}%). {o['active']:,} are still with the organisation."
    ]

    # ---- predicted risk (managers see their own department)
    dept_filter, params = "", {}
    if user.role == MANAGER:
        dept_filter, params = "WHERE department_id = :dept", {"dept": user.department_id}
    try:
        risk = _rows(db, f"SELECT risk_level, COUNT(*) AS n FROM v_attrition_risk {dept_filter} GROUP BY risk_level", params)
    except DBAPIError:
        db.rollback()
        risk = []
    counts = {r["risk_level"]: r["n"] for r in risk}
    scored = sum(counts.values())
    if scored:
        where = f"In {user.department_name}" if user.role == MANAGER else "Right now"
        high, medium = counts.get("HIGH", 0), counts.get("MEDIUM", 0)
        big_picture.append(
            f"{where}, the model sees {high} {'person' if high == 1 else 'people'} as likely to leave and "
            f"{medium} more with some risk: {one_in(100 * (high + medium) / scored)} of the current team needs attention."
        )

    # ---- what's driving it
    drivers = []
    ot = {r["overtime"]: r for r in _rows(db, """
        SELECT overtime, ROUND(100.0 * AVG(attrition::INT), 1) AS pct FROM employee_profiles GROUP BY overtime
    """)}
    if True in ot and False in ot and float(ot[False]["pct"]) > 0:
        ratio = float(ot[True]["pct"]) / float(ot[False]["pct"])
        drivers.append(f"Overtime is the clearest warning sign: people working overtime left "
                       f"{ratio:.1f}\u00d7 as often as those who didn't ({ot[True]['pct']}% vs {ot[False]['pct']}%).")

    depts = _rows(db, "SELECT department_name, attrition_rate_pct FROM v_department_summary "
                      "WHERE total_employees > 0 ORDER BY attrition_rate_pct DESC")
    if len(depts) >= 2:
        hi, lo = depts[0], depts[-1]
        drivers.append(f"{hi['department_name']} loses people fastest ({hi['attrition_rate_pct']}%), "
                       f"while {lo['department_name']} keeps them best ({lo['attrition_rate_pct']}%).")

    roles = _rows(db, "SELECT job_role, attrition_rate_pct FROM v_attrition_by_job_role "
                      "WHERE total_employees >= 20 ORDER BY attrition_rate_pct DESC LIMIT 1")
    if roles:
        drivers.append(f"{roles[0]['job_role']}s are the most likely to leave of any role "
                       f"({roles[0]['attrition_rate_pct']}%).")

    info = db.execute(text("SELECT info FROM model_runs ORDER BY run_id DESC LIMIT 1")).scalar() if _has_model_runs(db) else None
    if info:
        signs = [pretty_factor(f["feature"]) for f in info.get("top_factors", [])
                 if (f.get("weight") or f.get("importance") or 0) > 0][:3]
        if signs:
            drivers.append("The model's strongest warning signals are " +
                           (", ".join(signs[:-1]) + " and " + signs[-1] if len(signs) > 1 else signs[0]) + ".")

    # ---- who to focus on
    focus = []
    if scored:
        by_dept = _rows(db, f"""
            SELECT department_name, COUNT(*) FILTER (WHERE risk_level = 'HIGH') AS high
            FROM v_attrition_risk {dept_filter} GROUP BY department_name ORDER BY high DESC
        """, params)
        if by_dept and by_dept[0]["high"]:
            d = by_dept[0]
            where = "Your department" if user.role == MANAGER else d["department_name"]
            focus.append({"text": f"{where} has the most people likely to leave ({d['high']}). "
                                  "Open the risk list to see each person's reasons and suggested next steps.",
                          "link": "/at-risk", "cta": "See who and why"})

    # ---- what needs doing
    todos = []
    pending_sql = "SELECT COUNT(*) FROM leave_requests lr JOIN users u ON u.user_id = lr.user_id WHERE lr.status = 'PENDING'"
    if user.role == MANAGER:
        pending_sql += " AND u.department_id = :dept AND lr.user_id <> :me"
    pending = db.execute(text(pending_sql), {"dept": user.department_id, "me": user.user_id}).scalar() or 0
    if pending:
        todos.append({"text": f"{pending} leave request{'s are' if pending != 1 else ' is'} waiting for a decision.",
                      "link": "/leave", "cta": "Review leave"})

    trend = _rows(db, f"""
        SELECT date, 100.0 * COUNT(*) FILTER (WHERE status IN ('PRESENT', 'LATE')) / NULLIF(COUNT(*), 0) AS rate
        FROM attendance WHERE date BETWEEN {ON_LEAVE_AWARE_DAY} - 14 AND {ON_LEAVE_AWARE_DAY}
        GROUP BY date ORDER BY date
    """)
    if len(trend) >= 6:
        recent = sum(float(r["rate"]) for r in trend[-3:]) / 3
        before = sum(float(r["rate"]) for r in trend[-6:-3]) / 3
        if recent < before - 1:
            todos.append({"text": f"Attendance has slipped recently (from about {before:.0f}% to {recent:.0f}%).",
                          "link": "/attendance", "cta": "See attendance"})
        else:
            todos.append({"text": f"Attendance is steady at about {recent:.0f}%. Nothing unusual there.",
                          "link": "/attendance", "cta": "See attendance"})

    if user.role == VIEWER:
        # viewers get the organisation-wide picture only: no links into private pages, no operational to-dos
        focus = [{"text": f["text"].split(" Open the")[0]} for f in focus]
        todos = []

    headline = (
        "Attrition is a real but focused problem." if o["attrition_pct"] and float(o["attrition_pct"]) >= 10
        else "Attrition is low overall."
    )
    return {
        "headline": headline,
        "big_picture": big_picture,
        "drivers": drivers,
        "focus": focus,
        "todos": todos,
        "generated_at": datetime.now().isoformat(timespec="minutes"),
        "basis": "Built by rules from live database queries and the attrition model. It describes patterns, not causes.",
    }


def _has_model_runs(db):
    return db.execute(text("SELECT to_regclass('public.model_runs') IS NOT NULL")).scalar()
