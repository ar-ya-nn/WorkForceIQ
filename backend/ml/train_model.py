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
from sklearn.impute import SimpleImputer
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
    # median-imputation lets employees added through the website with a partial profile still be scored
    numeric = Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())])
    return ColumnTransformer([
        ("num", numeric, NUMERIC_FEATURES),
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


def _features(df):
    X = df[NUMERIC_FEATURES + CATEGORICAL_FEATURES].copy()
    # PostgreSQL NUMERIC columns arrive as Python Decimals; the model needs plain floats
    X[NUMERIC_FEATURES] = X[NUMERIC_FEATURES].astype(float)
    X[CATEGORICAL_FEATURES] = X[CATEGORICAL_FEATURES].fillna("Unknown").astype(str)
    return X


def explain_contributions(pipeline, X):
    """
    Per-employee feature attribution for a logistic regression.
    contribution = coefficient x (employee's value - average value), on the model's own scale,
    so contributions add up to how far this person's log-odds sit from the average person's.
    One-hot columns are summed back into their original feature (e.g. all job_role_* columns).
    Returns, for every row of X, the factors pushing risk up and the ones pulling it down.
    """
    prep = pipeline.named_steps["prep"]
    coef = pipeline.named_steps["model"].coef_[0]
    Xt = prep.transform(X)
    Xt = Xt.toarray() if hasattr(Xt, "toarray") else np.asarray(Xt)
    contrib = (Xt - Xt.mean(axis=0)) * coef

    names = [n.split("__", 1)[1] for n in prep.get_feature_names_out()]
    original = []
    for name in names:
        match = max((f for f in CATEGORICAL_FEATURES if name.startswith(f + "_")), key=len, default=None)
        original.append(match or name)
    features = sorted(set(original))
    index = {f: [i for i, o in enumerate(original) if o == f] for f in features}
    grouped = np.column_stack([contrib[:, index[f]].sum(axis=1) for f in features])

    out = []
    for row in grouped:
        order = np.argsort(-row)
        up = [{"f": features[i], "c": round(float(row[i]), 3)} for i in order[:4] if row[i] > 0.05]
        down = [{"f": features[i], "c": round(float(row[i]), 3)} for i in order[::-1][:3] if row[i] < -0.05]
        out.append({"up": up, "down": down})
    return out


def export_linear(pipeline):
    """
    Exports a fitted logistic-regression pipeline as plain numbers (JSON) so it can be stored in
    the database and scored anywhere without scikit-learn: medians for missing values, the
    standardisation, one weight per numeric feature and per category, and the intercept.
    """
    prep = pipeline.named_steps["prep"]
    model = pipeline.named_steps["model"]
    num = prep.named_transformers_["num"]
    medians = num.named_steps["impute"].statistics_
    scaler = num.named_steps["scale"]
    ohe = prep.named_transformers_["cat"]
    coef = model.coef_[0]

    numeric = []
    for i, name in enumerate(NUMERIC_FEATURES):
        numeric.append({"name": name, "median": float(medians[i]), "mean": float(scaler.mean_[i]),
                        "scale": float(scaler.scale_[i]) or 1.0, "coef": float(coef[i])})
    categorical, pos = [], len(NUMERIC_FEATURES)
    for name, cats in zip(CATEGORICAL_FEATURES, ohe.categories_):
        weights = {str(c): float(coef[pos + j]) for j, c in enumerate(cats)}
        categorical.append({"name": name, "weights": weights})
        pos += len(cats)
    return {"intercept": float(model.intercept_[0]), "numeric": numeric, "categorical": categorical}


def calibration_table(y, scores, bins=8):
    """
    How often people with similar scores actually left (out-of-fold). This turns a raw model score
    into an honest statement like "about 4 in 10 similar employees left".
    """
    edges = np.unique(np.quantile(scores, np.linspace(0, 1, bins + 1)))
    table = []
    for lo, hi in zip(edges[:-1], edges[1:]):
        mask = (scores >= lo) & (scores <= hi)
        if mask.sum() == 0:
            continue
        table.append({"lo": round(float(lo), 4), "hi": round(float(hi), 4),
                      "n": int(mask.sum()), "rate": round(float(y[mask].mean()), 4)})
    return table


def train(df):
    """
    Compares the candidate models with 5-fold cross-validation and picks the best by ROC-AUC.

    Every employee's risk score is an "out-of-fold" prediction: it comes from a model that
    never saw that employee during training, so the scores are honest, not memorised.
    """
    X = _features(df)
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

    # Explanations come from a logistic regression: exact when it is the chosen model,
    # otherwise a linear "surrogate" fitted on the same data (clearly labelled as approximate).
    if best_name == "Logistic Regression":
        explainer, method = final_model, "exact (logistic regression contributions)"
    else:
        explainer = candidate_models()["Logistic Regression"].fit(X, y)
        method = "approximate (linear surrogate of the " + best_name + ")"

    return {
        "model_name": best_name,
        "model": final_model,
        "scores": best["scores"],
        "metrics": best["metrics"],
        "comparison": {k: v["metrics"] for k, v in results.items()},
        "top_factors": _top_factors(final_model),
        "contributions": explain_contributions(explainer, X),
        "linear_model": export_linear(explainer),
        "explanation_method": method,
        "calibration": calibration_table(y, best["scores"]),
    }


# ---------------------------------------------------------------------------
# Database I/O
# ---------------------------------------------------------------------------

def run_training(engine, triggered_by=None, log=print):
    """
    Trains, scores every active employee and stores the results in ONE transaction:
    the old predictions are replaced and a row is added to model_runs (the training history).
    Used by the command line and by the admin's "Retrain model" button.
    """
    from sqlalchemy import text

    log("Reading employee data from the database...")
    df = pd.read_sql(text(TRAINING_QUERY), engine)
    if df["attrition"].nunique() < 2:
        raise ValueError("Need employees who stayed AND employees who left to train the model.")
    log(f"  {len(df)} employees, {int(df['attrition'].sum())} of them left")

    log("Training and comparing models (5-fold cross-validation)...")
    result = train(df)
    log(f"Best model: {result['model_name']}")

    df["risk_score"] = result["scores"]
    df["explanation"] = [json.dumps(c) for c in result["contributions"]]
    active = df[df["status"] == "ACTIVE"]
    rows = [{"user_id": int(r.user_id), "risk_score": round(float(r.risk_score), 4),
             "risk_level": risk_level(r.risk_score), "model_name": result["model_name"],
             "explanation": r.explanation}
            for r in active.itertuples()]
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
        "explanation_method": result["explanation_method"],
        "calibration": result["calibration"],
        "linear_model": result["linear_model"],      # used by the retention planner (what-if scoring)
    }

    with engine.begin() as conn:            # one transaction: scores and history saved together
        conn.execute(text("TRUNCATE attrition_predictions"))
        if rows:
            conn.execute(text("""
                INSERT INTO attrition_predictions (user_id, risk_score, risk_level, model_name, explanation)
                VALUES (:user_id, :risk_score, :risk_level, :model_name, CAST(:explanation AS JSONB))
            """), rows)
        conn.execute(text("""
            INSERT INTO model_runs (model_name, training_rows, roc_auc, info, triggered_by)
            VALUES (:model_name, :rows, :roc_auc, CAST(:info AS JSONB), :by)
        """), {"model_name": info["model_name"], "rows": len(df), "roc_auc": info["metrics"]["roc_auc"],
               "info": json.dumps(info), "by": triggered_by})

    # local copies (handy offline); online the database copy is the one that counts
    try:
        ARTIFACT_DIR.mkdir(exist_ok=True)
        joblib.dump(result["model"], MODEL_PATH)
        METRICS_PATH.write_text(json.dumps(info, indent=2))
    except OSError:
        pass
    return info


def main():
    from backend.app.database import engine

    info = run_training(engine)
    m = info["metrics"]
    print("\nDone!")
    print(f"  ROC-AUC {m['roc_auc']}  |  precision {m['precision']}  |  recall {m['recall']}  |  F1 {m['f1']}")
    print(f"  Scored {info['active_employees_scored']} active employees: {info['risk_level_counts']}")
    print("  Top risk factors:")
    for f in info["top_factors"][:5]:
        print(f"    - {f['feature']} ({f.get('effect', 'importance ' + str(f.get('importance')))})")


if __name__ == "__main__":
    main()
