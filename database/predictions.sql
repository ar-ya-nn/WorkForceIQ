-- =====================================================================
-- WorkForceIQ: attrition prediction table + view
-- Run this once in pgAdmin (Query Tool on WorkForceIQ) after schema.sql.
-- (It is also included at the end of schema.sql for fresh setups.)
-- =====================================================================

DROP VIEW  IF EXISTS v_attrition_risk;
DROP TABLE IF EXISTS attrition_predictions;

-- Latest risk score for each active employee, written by backend/ml/train_model.py
CREATE TABLE attrition_predictions (
    user_id      INT          PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    risk_score   NUMERIC(5,4) NOT NULL CHECK (risk_score BETWEEN 0 AND 1),
    risk_level   VARCHAR(6)   NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    model_name   VARCHAR(40)  NOT NULL,
    predicted_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_predictions_level ON attrition_predictions(risk_level);

-- Risk scores joined with who the employee is, for the API and dashboard
CREATE VIEW v_attrition_risk AS
SELECT ap.user_id,
       u.first_name || ' ' || u.last_name AS full_name,
       u.email,
       u.department_id,
       d.department_name,
       p.job_role,
       p.job_level,
       p.overtime,
       p.job_satisfaction,
       p.work_life_balance,
       p.years_at_company,
       p.years_since_last_promotion,
       p.monthly_income,
       ap.risk_score,
       ap.risk_level,
       ap.model_name,
       ap.predicted_at
FROM attrition_predictions ap
JOIN users u                  ON u.user_id = ap.user_id
JOIN employee_profiles p      ON p.user_id = ap.user_id
LEFT JOIN departments d       ON d.department_id = u.department_id;
