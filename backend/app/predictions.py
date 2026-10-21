import json
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.app.auth import ADMIN, MANAGER, CurrentUser, department_scope, ensure_can_view, require_roles
from backend.app.database import get_db
from backend.ml.train_model import METRICS_PATH

# Risk scores are sensitive: admins and managers only. Employees never see predictions.
router = APIRouter(prefix="/predictions", tags=["Attrition Predictions"],
                   dependencies=[Depends(require_roles(ADMIN, MANAGER))])


@router.get("/")
def list_predictions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    risk_level: Optional[Literal["HIGH", "MEDIUM", "LOW"]] = None,
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(require_roles(ADMIN, MANAGER)),
):
    """Active employees ranked by attrition risk (highest first), from v_attrition_risk."""
    scope = department_scope(user)
    if scope is not None:              # managers: own department only
        department_id = scope
    conditions, params = [], {"skip": skip, "limit": limit}
    if risk_level is not None:
        conditions.append("risk_level = :level")
        params["level"] = risk_level
    if department_id is not None:
        conditions.append("department_id = :dept")
        params["dept"] = department_id
    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    total = db.execute(text(f"SELECT COUNT(*) FROM v_attrition_risk {where}"), params).scalar()
    rows = db.execute(text(f"""
        SELECT * FROM v_attrition_risk {where}
        ORDER BY risk_score DESC, user_id
        OFFSET :skip LIMIT :limit
    """), params).mappings().all()
    return {"total": total, "skip": skip, "limit": limit, "items": [dict(r) for r in rows]}


@router.get("/summary")
def prediction_summary(db: Session = Depends(get_db)):
    """How many employees are in each risk level, overall and per department."""
    overall = db.execute(text("""
        SELECT risk_level, COUNT(*) AS employees, ROUND(AVG(risk_score), 4) AS avg_score
        FROM attrition_predictions
        GROUP BY risk_level
    """)).mappings().all()
    by_department = db.execute(text("""
        SELECT department_name,
               COUNT(*)                                   AS employees,
               COUNT(*) FILTER (WHERE risk_level = 'HIGH')   AS high_risk,
               COUNT(*) FILTER (WHERE risk_level = 'MEDIUM') AS medium_risk,
               COUNT(*) FILTER (WHERE risk_level = 'LOW')    AS low_risk,
               ROUND(AVG(risk_score), 4)                  AS avg_risk_score
        FROM v_attrition_risk
        GROUP BY department_name
        ORDER BY avg_risk_score DESC
    """)).mappings().all()
    if not overall:
        raise HTTPException(status_code=404,
                            detail="No predictions yet. Run: python -m backend.ml.train_model")
    return {"overall": [dict(r) for r in overall], "by_department": [dict(r) for r in by_department]}


@router.get("/model-info")
def model_info():
    """Which model was chosen, how well it performed, and the main risk factors."""
    if not METRICS_PATH.exists():
        raise HTTPException(status_code=404,
                            detail="Model not trained yet. Run: python -m backend.ml.train_model")
    return json.loads(METRICS_PATH.read_text())


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
