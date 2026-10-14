"""
Trains the attrition model on data from the WorkForceIQ database and saves
a risk score for every active employee into the attrition_predictions table.

Run from the repo root (venv active):
    python -m backend.ml.train_model
"""

import json
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score,
                             precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ARTIFACT_DIR = Path(__file__).parent / "artifacts"
MODEL_PATH = ARTIFACT_DIR / "attrition_model.joblib"
METRICS_PATH = ARTIFACT_DIR / "model_metrics.json"

SEED = 42
HIGH_RISK = 0.65      # risk_score >= this  -> HIGH
MEDIUM_RISK = 0.40    # risk_score >= this  -> MEDIUM, otherwise LOW

NUMERIC_FEATURES = [
    "age", "distance_from_home", "education", "job_level", "monthly_income",
    "percent_salary_hike", "stock_option_level", "overtime", "job_satisfaction",
    "environment_satisfaction", "relationship_satisfaction", "job_involvement",
    "work_life_balance", "num_companies_worked", "total_working_years",
    "training_times_last_year", "years_at_company", "years_in_current_role",
    "years_since_last_promotion", "years_with_curr_manager",
]
CATEGORICAL_FEATURES = [
    "department_name", "job_role", "business_travel", "marital_status",
    "education_field", "gender",
]

TRAINING_QUERY = f"""
    SELECT u.user_id, u.status, d.department_name,
           {", ".join("p." + c for c in NUMERIC_FEATURES + CATEGORICAL_FEATURES if c != "department_name")},
           p.attrition
    FROM users u
    JOIN employee_profiles p ON p.user_id = u.user_id
    JOIN departments d       ON d.department_id = u.department_id
"""


# ---------------------------------------------------------------------------
# Model building
# ---------------------------------------------------------------------------

def _preprocessor():
    return ColumnTransformer([
        ("num", StandardScaler(), NUMERIC_FEATURES),
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
    ])


def candidate_models():
    # class_weight="balanced" because only ~16% of employees left (imbalanced classes)
    return {
        "Logistic Regression": Pipeline([
            ("prep", _preprocessor()),
            ("model", LogisticRegression(class_weight="balanced", max_iter=2000, random_state=SEED)),
        ]),
        "Random Forest": Pipeline([
            ("prep", _preprocessor()),
            ("model", RandomForestClassifier(n_estimators=300, min_samples_leaf=3,
                                             class_weight="balanced", random_state=SEED, n_jobs=-1)),
        ]),
    }


def _metrics(y_true, scores):
    predicted = (scores >= 0.5).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, predicted).ravel()
    return {
        "roc_auc": round(roc_auc_score(y_true, scores), 4),
        "accuracy": round(accuracy_score(y_true, predicted), 4),
        "precision": round(precision_score(y_true, predicted, zero_division=0), 4),
        "recall": round(recall_score(y_true, predicted), 4),
        "f1": round(f1_score(y_true, predicted), 4),
        "confusion_matrix": {"true_negative": int(tn), "false_positive": int(fp),
                             "false_negative": int(fn), "true_positive": int(tp)},
    }


def _top_factors(pipeline, n=10):
    """Which features push the risk up or down the most."""
    names = pipeline.named_steps["prep"].get_feature_names_out()
    names = [x.split("__", 1)[1] for x in names]
    model = pipeline.named_steps["model"]
    if hasattr(model, "coef_"):
        weights = model.coef_[0]
        order = np.argsort(-np.abs(weights))[:n]
        return [{"feature": names[i], "weight": round(float(weights[i]), 4),
                 "effect": "increases risk" if weights[i] > 0 else "decreases risk"} for i in order]
    weights = model.feature_importances_
    order = np.argsort(-weights)[:n]
    return [{"feature": names[i], "importance": round(float(weights[i]), 4)} for i in order]


def risk_level(score):
    if score >= HIGH_RISK:
        return "HIGH"
    if score >= MEDIUM_RISK:
        return "MEDIUM"
    return "LOW"


def train(df):
    """
    Compares the candidate models with 5-fold cross-validation and picks the best by ROC-AUC.

    Every employee's risk score is an "out-of-fold" prediction: it comes from a model that
    never saw that employee during training, so the scores are honest, not memorised.
    """
    X = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES].copy()
    # PostgreSQL NUMERIC columns arrive as Python Decimals; the model needs plain floats
    X[NUMERIC_FEATURES] = X[NUMERIC_FEATURES].astype(float)
    y = df["attrition"].astype(int).to_numpy()
    folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)

    results = {}
    for name, pipeline in candidate_models().items():
        scores = cross_val_predict(pipeline, X, y, cv=folds, method="predict_proba")[:, 1]
        results[name] = {"scores": scores, "metrics": _metrics(y, scores), "pipeline": pipeline}
        print(f"  {name:<20} ROC-AUC {results[name]['metrics']['roc_auc']:.3f}   "
              f"F1 {results[name]['metrics']['f1']:.3f}   recall {results[name]['metrics']['recall']:.3f}")

    best_name = max(results, key=lambda k: results[k]["metrics"]["roc_auc"])
    best = results[best_name]
    final_model = best["pipeline"].fit(X, y)          # refit on all data for future use

    return {
        "model_name": best_name,
        "model": final_model,
        "scores": best["scores"],
        "metrics": best["metrics"],
        "comparison": {k: v["metrics"] for k, v in results.items()},
        "top_factors": _top_factors(final_model),
    }


# ---------------------------------------------------------------------------
# Database I/O
# ---------------------------------------------------------------------------

def main():
    from sqlalchemy import text

    from backend.app.database import engine

    print("Reading employee data from the database...")
    df = pd.read_sql(text(TRAINING_QUERY), engine)
    print(f"  {len(df)} employees, {int(df['attrition'].sum())} of them left")

    print("Training and comparing models (5-fold cross-validation)...")
    result = train(df)
    print(f"Best model: {result['model_name']}")

    df["risk_score"] = result["scores"]
    active = df[df["status"] == "ACTIVE"]
    rows = [{"user_id": int(r.user_id), "risk_score": round(float(r.risk_score), 4),
             "risk_level": risk_level(r.risk_score), "model_name": result["model_name"]}
            for r in active.itertuples()]

    with engine.begin() as conn:            # one transaction: old scores replaced all at once
        conn.execute(text("TRUNCATE attrition_predictions"))
        conn.execute(text("""
            INSERT INTO attrition_predictions (user_id, risk_score, risk_level, model_name)
            VALUES (:user_id, :risk_score, :risk_level, :model_name)
        """), rows)

    ARTIFACT_DIR.mkdir(exist_ok=True)
    joblib.dump(result["model"], MODEL_PATH)
    levels = pd.Series([r["risk_level"] for r in rows]).value_counts().to_dict()
    info = {
        "model_name": result["model_name"],
        "trained_at": datetime.now().isoformat(timespec="seconds"),
        "training_rows": len(df),
        "validation": "5-fold stratified cross-validation (out-of-fold predictions)",
        "thresholds": {"HIGH": HIGH_RISK, "MEDIUM": MEDIUM_RISK},
        "metrics": result["metrics"],
        "comparison": result["comparison"],
        "top_factors": result["top_factors"],
        "active_employees_scored": len(rows),
        "risk_level_counts": {k: int(levels.get(k, 0)) for k in ("HIGH", "MEDIUM", "LOW")},
    }
    METRICS_PATH.write_text(json.dumps(info, indent=2))

    m = result["metrics"]
    print("\nDone!")
    print(f"  ROC-AUC {m['roc_auc']}  |  precision {m['precision']}  |  recall {m['recall']}  |  F1 {m['f1']}")
    print(f"  Scored {len(rows)} active employees: {info['risk_level_counts']}")
    print("  Top risk factors:")
    for f in result["top_factors"][:5]:
        print(f"    - {f['feature']} ({f.get('effect', 'importance ' + str(f.get('importance')))})")


if __name__ == "__main__":
    main()
