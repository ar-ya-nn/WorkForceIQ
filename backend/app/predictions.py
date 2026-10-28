import json
import threading
from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from backend.app.auth import (ADMIN, MANAGER, CurrentUser, department_scope, ensure_can_view,
                              require_roles)
from backend.app.database import engine, get_db
from backend.app.explain import build_explanation, short_reason
from backend.ml.train_model import METRICS_PATH, run_training

# Risk scores are sensitive: admins and managers only. Employees never see predictions.
router = APIRouter(prefix="/predictions", tags=["Attrition Predictions"],
                   dependencies=[Depends(require_roles(ADMIN, MANAGER))])

AGE_BAND = """CASE WHEN {a} < 30 THEN 'Under 30' WHEN {a} < 40 THEN '30-39'
                   WHEN {a} < 50 THEN '40-49' ELSE '50+' END"""

# "Compare by" options. Fixed whitelist: the SQL expression never comes from the user.
#   risk:   expression over v_attrition_risk (active employees, predicted risk)
#   actual: expression over employee_profiles p JOIN users u JOIN departments d (everyone, real attrition)
BREAKDOWNS = {
    "gender":          {"risk": "gender",          "actual": "p.gender"},
    "department":      {"risk": "department_name", "actual": "d.department_name"},
    "job_role":        {"risk": "job_role",        "actual": "p.job_role"},
    "overtime":        {"risk": "CASE WHEN overtime THEN 'Overtime' ELSE 'No overtime' END",
                        "actual": "CASE WHEN p.overtime THEN 'Overtime' ELSE 'No overtime' END"},
    "age_band":        {"risk": AGE_BAND.format(a="age"), "actual": AGE_BAND.format(a="p.age")},
    "marital_status":  {"risk": "marital_status",  "actual": "p.marital_status"},
    "business_travel": {"risk": "business_travel", "actual": "p.business_travel"},
}


def _filters(user: CurrentUser, risk_level=None, department_id=None, gender=None,
             job_role=None, overtime=None, age_band=None):
    """Builds a parameterised WHERE clause for v_attrition_risk."""
    conditions, params = [], {}
    scope = department_scope(user)
    if scope is not None:                       # managers: own department only
        department_id = scope
    if risk_level:
        conditions.append("risk_level = :level"); params["level"] = risk_level
    if department_id is not None:
        conditions.append("department_id = :dept"); params["dept"] = department_id
    if gender:
        conditions.append("gender = :gender"); params["gender"] = gender
    if job_role:
        conditions.append("job_role = :job_role"); params["job_role"] = job_role
    if overtime is not None:
        conditions.append("overtime = :overtime"); params["overtime"] = overtime
    if age_band:
        conditions.append(f"{AGE_BAND.format(a='age')} = :age_band"); params["age_band"] = age_band
    return ("WHERE " + " AND ".join(conditions)) if conditions else "", params


@router.get("/")
def list_predictions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    risk_level: Optional[Literal["HIGH", "MEDIUM", "LOW"]] = None,
    department_id: Optional[int] = None,
    gender: Optional[Literal["Male", "Female"]] = None,
    job_role: Optional[str] = None,
    overtime: Optional[bool] = None,
    age_band: Optional[Literal["Under 30", "30-39", "40-49", "50+"]] = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_roles(ADMIN, MANAGER)),
):
    """Active employees ranked by attrition risk (highest first), from v_attrition_risk."""
    where, params = _filters(user, risk_level, department_id, gender, job_role, overtime, age_band)
    total = db.execute(text(f"SELECT COUNT(*) FROM v_attrition_risk {where}"), params).scalar()
    rows = [dict(r) for r in db.execute(text(f"""
        SELECT * FROM v_attrition_risk {where}
        ORDER BY risk_score DESC, user_id
        OFFSET :skip LIMIT :limit
    """), {**params, "skip": skip, "limit": limit}).mappings().all()]
    _add_main_reasons(db, rows)
    return {"total": total, "skip": skip, "limit": limit, "items": rows}


def _profiles_and_factors(db: Session, user_ids):
    if not user_ids:
        return {}, {}
    profiles = {r["user_id"]: dict(r) for r in db.execute(text("""
        SELECT p.*, d.department_name FROM employee_profiles p
        JOIN users u ON u.user_id = p.user_id
        LEFT JOIN departments d ON d.department_id = u.department_id
        WHERE p.user_id = ANY(:ids)
    """), {"ids": list(user_ids)}).mappings()}
    factors = {r[0]: r[1] for r in db.execute(text(
        "SELECT user_id, explanation FROM attrition_predictions WHERE user_id = ANY(:ids)"), {"ids": list(user_ids)})}
    return profiles, factors


def _add_main_reasons(db: Session, rows):
    """
    Adds 'main_reason' (a short sentence from the explainable-AI factors) to each row.
    If explanations aren't available yet (update_v3.sql not run, or the model not retrained),
    the list still loads and the reason is simply left empty.
    """
    try:
        profiles, factors = _profiles_and_factors(db, [r["user_id"] for r in rows])
    except DBAPIError:
        db.rollback()
        profiles, factors = {}, {}
    for r in rows:
        r["main_reason"] = short_reason(factors.get(r["user_id"]), profiles.get(r["user_id"], {}))


@router.get("/job-roles")
def job_roles(db: Session = Depends(get_db)):
    """Job roles that currently have predictions (for the filter dropdown)."""
    return [r[0] for r in db.execute(text("SELECT DISTINCT job_role FROM v_attrition_risk ORDER BY 1"))]


@router.get("/breakdown")
def breakdown(
    by: Literal[tuple(BREAKDOWNS)] = "gender",
    gender: Optional[Literal["Male", "Female"]] = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_roles(ADMIN, MANAGER)),
):
    """
    Predicted risk for active employees, grouped by one category (e.g. gender),
    next to the real historical attrition rate of that group (all employees, incl. those who left).
    """
    expr = BREAKDOWNS[by]
    where, params = _filters(user, gender=gender)
    risk_rows = db.execute(text(f"""
        SELECT {expr['risk']}                                   AS grp,
               COUNT(*)                                         AS employees,
               COUNT(*) FILTER (WHERE risk_level = 'HIGH')      AS high,
               COUNT(*) FILTER (WHERE risk_level = 'MEDIUM')    AS medium,
               COUNT(*) FILTER (WHERE risk_level = 'LOW')       AS low,
               ROUND(100.0 * AVG(risk_score), 1)                AS avg_risk_pct
        FROM v_attrition_risk {where}
        GROUP BY 1
    """), params).mappings().all()

    actual_where, actual_params = [], {}
    scope = department_scope(user)
    if scope is not None:
        actual_where.append("u.department_id = :dept"); actual_params["dept"] = scope
    if gender:
        actual_where.append("p.gender = :gender"); actual_params["gender"] = gender
    actual_sql = ("WHERE " + " AND ".join(actual_where)) if actual_where else ""
    actual_rows = db.execute(text(f"""
        SELECT {expr['actual']}                            AS grp,
               COUNT(*)                                    AS total_employees,
               COUNT(*) FILTER (WHERE p.attrition)         AS employees_left,
               ROUND(100.0 * AVG(p.attrition::INT), 1)     AS actual_attrition_pct
        FROM employee_profiles p
        JOIN users u            ON u.user_id = p.user_id
        LEFT JOIN departments d ON d.department_id = u.department_id
        {actual_sql}
        GROUP BY 1
    """), actual_params).mappings().all()

    actual = {r["grp"]: dict(r) for r in actual_rows}
    groups = []
    for r in risk_rows:
        g = dict(r)
        a = actual.get(g["grp"], {})
        g.update({k: a.get(k) for k in ("total_employees", "employees_left", "actual_attrition_pct")})
        groups.append(g)
    groups.sort(key=lambda g: (g["avg_risk_pct"] is None, -(g["avg_risk_pct"] or 0)))
    return {"by": by, "groups": groups}


@router.get("/summary")
def prediction_summary(db: Session = Depends(get_db),
                       user: CurrentUser = Depends(require_roles(ADMIN, MANAGER))):
    """How many employees are in each risk level, overall and per department."""
    where, params = _filters(user)
    overall = db.execute(text(f"""
        SELECT risk_level, COUNT(*) AS employees, ROUND(AVG(risk_score), 4) AS avg_score
        FROM v_attrition_risk {where}
        GROUP BY risk_level
    """), params).mappings().all()
    by_department = db.execute(text(f"""
        SELECT department_name,
               COUNT(*)                                      AS employees,
               COUNT(*) FILTER (WHERE risk_level = 'HIGH')   AS high_risk,
               COUNT(*) FILTER (WHERE risk_level = 'MEDIUM') AS medium_risk,
               COUNT(*) FILTER (WHERE risk_level = 'LOW')    AS low_risk,
               ROUND(AVG(risk_score), 4)                     AS avg_risk_score
        FROM v_attrition_risk {where}
        GROUP BY department_name
        ORDER BY avg_risk_score DESC
    """), params).mappings().all()
    if not overall:
        raise HTTPException(status_code=404, detail="No predictions yet. An admin can train the model from Admin → ML model.")
    return {"overall": [dict(r) for r in overall], "by_department": [dict(r) for r in by_department]}


@router.get("/model-info")
def model_info(db: Session = Depends(get_db)):
    """Latest training run (stored in the model_runs table), plus the run history."""
    latest = db.execute(text("SELECT info FROM model_runs ORDER BY run_id DESC LIMIT 1")).scalar()
    if latest is None:
        if not METRICS_PATH.exists():
            raise HTTPException(status_code=404, detail="Model not trained yet.")
        latest = json.loads(METRICS_PATH.read_text())
    history = db.execute(text("""
        SELECT r.run_id, r.trained_at, r.model_name, r.training_rows, r.roc_auc,
               u.first_name || ' ' || u.last_name AS triggered_by
        FROM model_runs r LEFT JOIN users u ON u.user_id = r.triggered_by
        ORDER BY r.run_id DESC LIMIT 10
    """)).mappings().all()
    return {**latest, "history": [dict(h) for h in history]}


# ---------------------------------------------------------------------------
# Retraining from the website (admin only). Runs in the background so the
# request returns immediately; the page polls /retrain/status.
# ---------------------------------------------------------------------------

_status = {"state": "idle", "message": None, "started_at": None, "finished_at": None}
_lock = threading.Lock()


def _run_retrain(user_id: int):
    try:
        info = run_training(engine, triggered_by=user_id, log=lambda *_: None)
        msg = f"{info['model_name']} trained on {info['training_rows']} employees (ROC-AUC {info['metrics']['roc_auc']})"
        _status.update(state="done", message=msg, finished_at=datetime.now().isoformat(timespec="seconds"))
    except Exception as exc:                     # report the problem to the admin instead of crashing
        _status.update(state="failed", message=str(exc), finished_at=datetime.now().isoformat(timespec="seconds"))


@router.post("/retrain", status_code=202)
def retrain(background: BackgroundTasks, user: CurrentUser = Depends(require_roles(ADMIN))):
    with _lock:
        if _status["state"] == "running":
            raise HTTPException(status_code=409, detail="Training is already running")
        _status.update(state="running", message="Training started", finished_at=None,
                       started_at=datetime.now().isoformat(timespec="seconds"))
    background.add_task(_run_retrain, user.user_id)
    return _status


@router.get("/retrain/status")
def retrain_status(_: CurrentUser = Depends(require_roles(ADMIN))):
    return _status


@router.get("/{user_id}/explain")
def explain_prediction(user_id: int, db: Session = Depends(get_db),
                       user: CurrentUser = Depends(require_roles(ADMIN, MANAGER))):
    """Plain-language explainable-AI summary for one employee: why, how likely, and what to do."""
    ensure_can_view(db, user, user_id)
    pred = db.execute(text("""
        SELECT ap.risk_score, ap.risk_level, u.first_name
        FROM attrition_predictions ap JOIN users u ON u.user_id = ap.user_id
        WHERE ap.user_id = :id
    """), {"id": user_id}).mappings().first()
    if pred is None:
        raise HTTPException(status_code=404, detail="Only active employees with a profile are scored")

    try:
        profiles, factors = _profiles_and_factors(db, [user_id])
    except DBAPIError:
        db.rollback()
        raise HTTPException(status_code=409,
                            detail="Explanations aren't set up yet: run database/update_v3.sql, then retrain the model.")
    averages = dict(db.execute(text("""
        SELECT AVG(monthly_income) AS monthly_income, AVG(distance_from_home) AS distance_from_home
        FROM employee_profiles
    """)).mappings().first())
    run = db.execute(text("SELECT info FROM model_runs ORDER BY run_id DESC LIMIT 1")).scalar() or {}
    if factors.get(user_id) is None:
        raise HTTPException(status_code=409,
                            detail="Explanations aren't ready yet. An admin needs to retrain the model once.")
    return build_explanation(
        first_name=pred["first_name"], level=pred["risk_level"], score=pred["risk_score"],
        factors=factors[user_id], profile=profiles.get(user_id, {}), averages=averages,
        calibration=run.get("calibration"), method=run.get("explanation_method"),
    )


@router.get("/{user_id}")
def get_prediction(user_id: int, db: Session = Depends(get_db),
                   user: CurrentUser = Depends(require_roles(ADMIN, MANAGER))):
    ensure_can_view(db, user, user_id)
    row = db.execute(text("SELECT * FROM v_attrition_risk WHERE user_id = :id"),
                     {"id": user_id}).mappings().first()
    if row is None:
        raise HTTPException(status_code=404,
                            detail="No prediction for this user (only active employees are scored)")
    return dict(row)
