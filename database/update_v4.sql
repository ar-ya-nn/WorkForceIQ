-- =====================================================================
-- WorkForceIQ update v4: closed-loop retention planner
-- Run once on an existing database (local pgAdmin AND Neon), after update_v3.sql.
-- Adds 3 tables, a partial unique index, 2 triggers, an audit trigger, a view,
-- and a starter catalogue of 10 interventions. No existing data is changed.
-- Then retrain the model once so it stores the parameters the planner needs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Retention planner: interventions, plans, actions and measured outcomes
-- ---------------------------------------------------------------------

-- Catalogue of retention interventions: what each one changes and what it costs
CREATE TABLE IF NOT EXISTS intervention_types (
    type_id     SERIAL        PRIMARY KEY,
    code        VARCHAR(30)   NOT NULL UNIQUE,
    name        VARCHAR(80)   NOT NULL,
    description TEXT,
    change      JSONB         NOT NULL,            -- e.g. {"overtime": false} or {"job_satisfaction": "+1"}
    cost_kind   VARCHAR(12)   NOT NULL CHECK (cost_kind IN ('FIXED', 'PCT_SALARY')),
    cost_value  NUMERIC(12,2) NOT NULL CHECK (cost_value >= 0),
    active      BOOLEAN       NOT NULL DEFAULT TRUE
);

-- A retention plan for one employee
CREATE TABLE IF NOT EXISTS retention_plans (
    plan_id         SERIAL       PRIMARY KEY,
    user_id         INT          NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_by      INT          REFERENCES users(user_id) ON DELETE SET NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    follow_up_date  DATE         NOT NULL,
    status          VARCHAR(12)  NOT NULL DEFAULT 'PROPOSED'
                    CHECK (status IN ('PROPOSED', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
    risk_before     NUMERIC(5,4) NOT NULL CHECK (risk_before BETWEEN 0 AND 1),
    risk_after      NUMERIC(5,4) NOT NULL CHECK (risk_after BETWEEN 0 AND 1),   -- predicted, after the plan
    total_cost      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
    notes           TEXT,
    CHECK (follow_up_date >= created_at::DATE)
);

-- At most one open plan per employee (a partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_open_plan_per_employee
    ON retention_plans(user_id) WHERE status IN ('PROPOSED', 'IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_plans_status ON retention_plans(status);

-- The actions inside a plan
CREATE TABLE IF NOT EXISTS plan_actions (
    plan_id       INT          NOT NULL REFERENCES retention_plans(plan_id) ON DELETE CASCADE,
    type_id       INT          NOT NULL REFERENCES intervention_types(type_id),
    cost          NUMERIC(12,2) NOT NULL CHECK (cost >= 0),
    expected_drop NUMERIC(5,4) NOT NULL CHECK (expected_drop BETWEEN -1 AND 1),
    status        VARCHAR(10)  NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'DONE', 'SKIPPED')),
    completed_at  TIMESTAMP,
    PRIMARY KEY (plan_id, type_id),
    CHECK ((status = 'PLANNED') = (completed_at IS NULL))
);

-- Trigger 1: stamp the time an action is finished (or clear it if re-opened)
CREATE OR REPLACE FUNCTION fn_plan_action_stamp() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status <> 'PLANNED' AND OLD.status = 'PLANNED' THEN
        NEW.completed_at := NOW();
    ELSIF NEW.status = 'PLANNED' THEN
        NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plan_action_stamp ON plan_actions;
CREATE TRIGGER trg_plan_action_stamp
BEFORE UPDATE OF status ON plan_actions
FOR EACH ROW EXECUTE FUNCTION fn_plan_action_stamp();

-- Trigger 2: move the plan forward automatically as its actions are completed
CREATE OR REPLACE FUNCTION fn_plan_progress() RETURNS TRIGGER AS $$
DECLARE
    open_actions INT;
BEGIN
    SELECT COUNT(*) INTO open_actions FROM plan_actions
    WHERE plan_id = NEW.plan_id AND status = 'PLANNED';

    IF open_actions = 0 THEN
        UPDATE retention_plans SET status = 'DONE'
        WHERE plan_id = NEW.plan_id AND status IN ('PROPOSED', 'IN_PROGRESS');
    ELSE
        UPDATE retention_plans SET status = 'IN_PROGRESS'
        WHERE plan_id = NEW.plan_id AND status = 'PROPOSED';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plan_progress ON plan_actions;
CREATE TRIGGER trg_plan_progress
AFTER UPDATE OF status ON plan_actions
FOR EACH ROW EXECUTE FUNCTION fn_plan_progress();

-- every change to a plan is audited like the other important tables
DROP TRIGGER IF EXISTS trg_audit_retention_plans ON retention_plans;
CREATE TRIGGER trg_audit_retention_plans
AFTER INSERT OR UPDATE OR DELETE ON retention_plans
FOR EACH ROW EXECUTE FUNCTION fn_audit_log('plan_id');

-- What actually worked: for each intervention, how many finished plans used it and
-- how many of those employees are still here. Feeds back into future recommendations.
CREATE OR REPLACE VIEW v_intervention_effectiveness AS
SELECT t.type_id,
       t.code,
       t.name,
       COUNT(DISTINCT a.plan_id)                                                    AS times_planned,
       COUNT(DISTINCT a.plan_id) FILTER (WHERE p.status = 'DONE' AND a.status = 'DONE') AS closed,
       COUNT(DISTINCT a.plan_id) FILTER (WHERE p.status = 'DONE' AND a.status = 'DONE'
                                         AND u.status = 'ACTIVE')                   AS retained,
       ROUND(AVG(p.risk_after) FILTER (WHERE p.status = 'DONE' AND a.status = 'DONE'), 4) AS avg_risk_after,
       ROUND(AVG(a.expected_drop), 4)                                               AS avg_expected_drop
FROM intervention_types t
LEFT JOIN plan_actions a    ON a.type_id = t.type_id
LEFT JOIN retention_plans p ON p.plan_id = a.plan_id
LEFT JOIN users u           ON u.user_id = p.user_id
GROUP BY t.type_id, t.code, t.name;

-- Starter catalogue (costs are yearly, in the same currency as salaries; editable by admins)
INSERT INTO intervention_types (code, name, description, change, cost_kind, cost_value) VALUES
 ('REDUCE_OVERTIME', 'Cut overtime',              'Rebalance workload or add support so they stop working overtime.', '{"overtime": false}',                                   'FIXED',      60000),
 ('ROLE_FIT',        'Role-fit 1:1s',             'Regular one-to-ones and job redesign to improve job satisfaction.', '{"job_satisfaction": "+1"}',                           'FIXED',      15000),
 ('FLEXIBLE_WORK',   'Flexible hours / hybrid',   'Flexible schedule or hybrid days to improve work-life balance.',   '{"work_life_balance": "+1"}',                          'FIXED',       8000),
 ('MENTORING',       'Mentor and team support',   'Pair with a mentor and strengthen team relationships.',            '{"relationship_satisfaction": "+1"}',                  'FIXED',      12000),
 ('WORKSPACE',       'Workspace and tools',       'Better equipment, tools or workspace.',                            '{"environment_satisfaction": "+1"}',                   'FIXED',      20000),
 ('PAY_REVIEW',      'Pay review (+10%)',         'Bring pay in line with the role.',                                 '{"monthly_income": "*1.10", "percent_salary_hike": "+3"}', 'PCT_SALARY', 10),
 ('PROMOTION',       'Promotion',                 'Promote to the next job level.',                                   '{"job_level": "+1", "years_since_last_promotion": "=0", "monthly_income": "*1.15"}', 'PCT_SALARY', 15),
 ('STOCK_OPTIONS',   'Stock options',             'Grant (more) stock options as a long-term incentive.',             '{"stock_option_level": "+1"}',                         'FIXED',      50000),
 ('LESS_TRAVEL',     'Reduce business travel',    'Share out or cut frequent travel.',                                '{"business_travel": "Travel_Rarely"}',                 'FIXED',      10000),
 ('TRAINING',        'Training programme',        'Fund courses or certifications.',                                  '{"training_times_last_year": "+2"}',                   'FIXED',      25000)
ON CONFLICT (code) DO NOTHING;
