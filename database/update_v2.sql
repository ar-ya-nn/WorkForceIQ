-- =====================================================================
-- WorkForceIQ update (run once on an existing database: local pgAdmin AND Neon)
-- Safe: changes a view and a trigger function, and blanks out password hashes in old audit entries.
--   1. v_attrition_risk gets gender, age, marital_status, business_travel
--      (for the "compare by category" charts on the Attrition Risk page)
--   2. the audit trigger stops copying password hashes into audit_logs
--   3. new table model_runs: history of every model training run
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_audit_log() RETURNS TRIGGER AS $$
DECLARE
    old_row JSONB;
    new_row JSONB;
    row_data JSONB;
BEGIN
    -- password hashes are removed before anything is written to the audit log
    IF TG_OP IN ('UPDATE', 'DELETE') THEN old_row := to_jsonb(OLD) - 'password_hash'; END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN new_row := to_jsonb(NEW) - 'password_hash'; END IF;
    row_data := COALESCE(new_row, old_row);

    INSERT INTO audit_logs (table_name, record_id, user_id, action, old_data, new_data)
    VALUES (
        TG_TABLE_NAME,
        (row_data ->> TG_ARGV[0])::BIGINT,
        (row_data ->> 'user_id')::INT,
        TG_OP,
        old_row,
        new_row
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- History of every model training run (written by train_model.py and the admin "Retrain" button)
CREATE TABLE IF NOT EXISTS model_runs (
    run_id        SERIAL       PRIMARY KEY,
    trained_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    model_name    VARCHAR(40)  NOT NULL,
    training_rows INT          NOT NULL CHECK (training_rows > 0),
    roc_auc       NUMERIC(5,4) CHECK (roc_auc BETWEEN 0 AND 1),
    info          JSONB        NOT NULL,
    triggered_by  INT          REFERENCES users(user_id) ON DELETE SET NULL
);

-- remove any password hashes already stored in old audit entries
UPDATE audit_logs
SET old_data = old_data - 'password_hash',
    new_data = new_data - 'password_hash'
WHERE table_name = 'users';

-- Risk scores joined with who the employee is, for the API and dashboard
CREATE OR REPLACE VIEW v_attrition_risk AS
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
       ap.predicted_at,
       p.gender,
       p.age,
       p.marital_status,
       p.business_travel
FROM attrition_predictions ap
JOIN users u                  ON u.user_id = ap.user_id
JOIN employee_profiles p      ON p.user_id = ap.user_id
LEFT JOIN departments d       ON d.department_id = u.department_id;
