-- =====================================================================
-- WorkForceIQ database schema (PostgreSQL 13+)
-- Run this once on an empty database. Running it again wipes everything.
-- =====================================================================

DROP TABLE IF EXISTS attrition_predictions, audit_logs, performance_reviews, leave_requests, leave_types,
                     attendance, employee_profiles, users, departments, roles CASCADE;
DROP FUNCTION IF EXISTS fn_audit_log() CASCADE;
DROP FUNCTION IF EXISTS fn_validate_leave_request() CASCADE;
DROP PROCEDURE IF EXISTS approve_leave(INT, INT);


-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

CREATE TABLE roles (
    role_id   SMALLINT    PRIMARY KEY,
    role_name VARCHAR(20) NOT NULL UNIQUE
);

CREATE TABLE departments (
    department_id   SERIAL        PRIMARY KEY,
    department_name VARCHAR(60)   NOT NULL UNIQUE,
    budget          NUMERIC(14,2) CHECK (budget >= 0)
);

CREATE TABLE users (
    user_id       SERIAL        PRIMARY KEY,
    first_name    VARCHAR(50)   NOT NULL,
    last_name     VARCHAR(50)   NOT NULL,
    email         VARCHAR(120)  NOT NULL UNIQUE,
    password_hash VARCHAR(100)  NOT NULL,
    role_id       SMALLINT      NOT NULL REFERENCES roles(role_id),
    department_id INT           REFERENCES departments(department_id) ON DELETE SET NULL,
    manager_id    INT           REFERENCES users(user_id) ON DELETE SET NULL,
    joining_date  DATE          NOT NULL DEFAULT CURRENT_DATE,
    status        VARCHAR(10)   NOT NULL DEFAULT 'ACTIVE'
                  CHECK (status IN ('ACTIVE', 'EXITED')),
    salary        NUMERIC(12,2) CHECK (salary > 0),
    CHECK (manager_id IS NULL OR manager_id <> user_id)
);

-- HR attributes from the IBM HR Analytics dataset (1 : 1 with users).
-- Kept separate from users so login/identity data and analytics data don't mix.
CREATE TABLE employee_profiles (
    user_id                    INT          PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    ibm_employee_number        INT          UNIQUE,
    age                        SMALLINT     NOT NULL CHECK (age BETWEEN 18 AND 65),
    gender                     VARCHAR(10)  NOT NULL CHECK (gender IN ('Male', 'Female')),
    marital_status             VARCHAR(10)  NOT NULL CHECK (marital_status IN ('Single', 'Married', 'Divorced')),
    education                  SMALLINT     CHECK (education BETWEEN 1 AND 5),
    education_field            VARCHAR(30),
    job_role                   VARCHAR(40)  NOT NULL,
    job_level                  SMALLINT     NOT NULL CHECK (job_level BETWEEN 1 AND 5),
    business_travel            VARCHAR(20)  CHECK (business_travel IN ('Non-Travel', 'Travel_Rarely', 'Travel_Frequently')),
    distance_from_home         SMALLINT     CHECK (distance_from_home >= 0),
    monthly_income             NUMERIC(10,2) NOT NULL CHECK (monthly_income > 0),
    percent_salary_hike        SMALLINT     CHECK (percent_salary_hike BETWEEN 0 AND 100),
    stock_option_level         SMALLINT     CHECK (stock_option_level BETWEEN 0 AND 3),
    overtime                   BOOLEAN      NOT NULL DEFAULT FALSE,
    job_satisfaction           SMALLINT     CHECK (job_satisfaction BETWEEN 1 AND 4),
    environment_satisfaction   SMALLINT     CHECK (environment_satisfaction BETWEEN 1 AND 4),
    relationship_satisfaction  SMALLINT     CHECK (relationship_satisfaction BETWEEN 1 AND 4),
    job_involvement            SMALLINT     CHECK (job_involvement BETWEEN 1 AND 4),
    work_life_balance          SMALLINT     CHECK (work_life_balance BETWEEN 1 AND 4),
    num_companies_worked       SMALLINT     CHECK (num_companies_worked >= 0),
    total_working_years        SMALLINT     CHECK (total_working_years >= 0),
    training_times_last_year   SMALLINT     CHECK (training_times_last_year >= 0),
    years_at_company           SMALLINT     CHECK (years_at_company >= 0),
    years_in_current_role      SMALLINT     CHECK (years_in_current_role >= 0),
    years_since_last_promotion SMALLINT     CHECK (years_since_last_promotion >= 0),
    years_with_curr_manager    SMALLINT     CHECK (years_with_curr_manager >= 0),
    attrition                  BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE attendance (
    attendance_id BIGSERIAL   PRIMARY KEY,
    user_id       INT         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    date          DATE        NOT NULL,
    check_in      TIMESTAMP,
    check_out     TIMESTAMP,
    status        VARCHAR(10) NOT NULL
                  CHECK (status IN ('PRESENT', 'LATE', 'ABSENT', 'ON_LEAVE')),
    UNIQUE (user_id, date),                                     -- one record per person per day
    CHECK (check_out IS NULL OR check_in IS NULL OR check_out > check_in),
    CHECK ((status IN ('ABSENT', 'ON_LEAVE')) = (check_in IS NULL))  -- no check-in when absent / on leave
);

CREATE TABLE leave_types (
    leave_type_id SERIAL      PRIMARY KEY,
    type_name     VARCHAR(10) NOT NULL UNIQUE,
    max_days      SMALLINT    NOT NULL CHECK (max_days > 0)
);

CREATE TABLE leave_requests (
    leave_id      SERIAL      PRIMARY KEY,
    user_id       INT         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    leave_type_id INT         NOT NULL REFERENCES leave_types(leave_type_id),
    start_date    DATE        NOT NULL,
    end_date      DATE        NOT NULL,
    reason        TEXT,
    status        VARCHAR(10) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    approved_by   INT         REFERENCES users(user_id) ON DELETE SET NULL,
    requested_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    CHECK (end_date >= start_date),
    CHECK (EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM end_date)),  -- keeps yearly limits simple
    CHECK (approved_by IS NULL OR approved_by <> user_id)
);

CREATE TABLE performance_reviews (
    review_id   SERIAL   PRIMARY KEY,
    user_id     INT      NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    reviewer_id INT      NOT NULL REFERENCES users(user_id),
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    feedback    TEXT,
    review_date DATE     NOT NULL,
    UNIQUE (user_id, review_date),
    CHECK (reviewer_id <> user_id)
);

CREATE TABLE audit_logs (
    log_id     BIGSERIAL   PRIMARY KEY,
    table_name VARCHAR(40) NOT NULL,
    record_id  BIGINT,
    user_id    INT,                                  -- the employee the change is about
    action     VARCHAR(10) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data   JSONB,
    new_data   JSONB,
    changed_by TEXT        NOT NULL DEFAULT CURRENT_USER,
    timestamp  TIMESTAMP   NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------
-- 2. INDEXES (on columns used for joins, filters and grouping)
-- ---------------------------------------------------------------------

CREATE INDEX idx_users_department   ON users(department_id);
CREATE INDEX idx_users_manager      ON users(manager_id);
CREATE INDEX idx_users_status       ON users(status);
CREATE INDEX idx_profiles_job_role  ON employee_profiles(job_role);
CREATE INDEX idx_profiles_attrition ON employee_profiles(attrition);
CREATE INDEX idx_attendance_date    ON attendance(date);           -- (user_id, date) already indexed by UNIQUE
CREATE INDEX idx_leave_user         ON leave_requests(user_id);
CREATE INDEX idx_leave_status       ON leave_requests(status);
CREATE INDEX idx_reviews_user       ON performance_reviews(user_id);
CREATE INDEX idx_audit_table_time   ON audit_logs(table_name, timestamp);


-- ---------------------------------------------------------------------
-- 3. TRIGGERS
-- ---------------------------------------------------------------------

-- 3a. Generic audit trigger. TG_ARGV[0] is the primary-key column of the table.
CREATE FUNCTION fn_audit_log() RETURNS TRIGGER AS $$
DECLARE
    row_data JSONB;
BEGIN
    IF TG_OP = 'DELETE' THEN
        row_data := to_jsonb(OLD);
    ELSE
        row_data := to_jsonb(NEW);
    END IF;

    INSERT INTO audit_logs (table_name, record_id, user_id, action, old_data, new_data)
    VALUES (
        TG_TABLE_NAME,
        (row_data ->> TG_ARGV[0])::BIGINT,
        (row_data ->> 'user_id')::INT,
        TG_OP,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_users
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION fn_audit_log('user_id');

CREATE TRIGGER trg_audit_profiles
AFTER INSERT OR UPDATE OR DELETE ON employee_profiles
FOR EACH ROW EXECUTE FUNCTION fn_audit_log('user_id');

CREATE TRIGGER trg_audit_leave
AFTER INSERT OR UPDATE OR DELETE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION fn_audit_log('leave_id');

CREATE TRIGGER trg_audit_reviews
AFTER INSERT OR UPDATE OR DELETE ON performance_reviews
FOR EACH ROW EXECUTE FUNCTION fn_audit_log('review_id');


-- 3b. Leave validation: no overlapping leave, and stay within the yearly limit.
CREATE FUNCTION fn_validate_leave_request() RETURNS TRIGGER AS $$
DECLARE
    days_used  INT;
    days_asked INT;
    max_allow  INT;
BEGIN
    days_asked := NEW.end_date - NEW.start_date + 1;

    IF NEW.status = 'REJECTED' THEN
        RETURN NEW;                      -- rejected requests don't use up anything
    END IF;

    IF EXISTS (
        SELECT 1 FROM leave_requests
        WHERE user_id = NEW.user_id
          AND leave_id IS DISTINCT FROM NEW.leave_id
          AND status <> 'REJECTED'
          AND start_date <= NEW.end_date
          AND end_date   >= NEW.start_date
    ) THEN
        RAISE EXCEPTION 'Leave overlaps with an existing request for user %', NEW.user_id;
    END IF;

    SELECT max_days INTO max_allow FROM leave_types WHERE leave_type_id = NEW.leave_type_id;

    SELECT COALESCE(SUM(end_date - start_date + 1), 0) INTO days_used
    FROM leave_requests
    WHERE user_id = NEW.user_id
      AND leave_type_id = NEW.leave_type_id
      AND leave_id IS DISTINCT FROM NEW.leave_id
      AND status <> 'REJECTED'
      AND EXTRACT(YEAR FROM start_date) = EXTRACT(YEAR FROM NEW.start_date);

    IF days_used + days_asked > max_allow THEN
        RAISE EXCEPTION 'Leave limit exceeded: % of % days already used, % requested',
                        days_used, max_allow, days_asked;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_leave
BEFORE INSERT OR UPDATE ON leave_requests
FOR EACH ROW EXECUTE FUNCTION fn_validate_leave_request();


-- ---------------------------------------------------------------------
-- 4. TRANSACTION: approve a leave request
--    Approves the request and marks those weekdays as ON_LEAVE in attendance.
--    Both steps succeed together or are rolled back together.
-- ---------------------------------------------------------------------

CREATE PROCEDURE approve_leave(p_leave_id INT, p_approver_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    req leave_requests%ROWTYPE;
BEGIN
    -- lock the row so two managers can't approve it at the same time
    SELECT * INTO req FROM leave_requests WHERE leave_id = p_leave_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Leave request % does not exist', p_leave_id;
    END IF;
    IF req.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Leave request % is already %', p_leave_id, req.status;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = p_approver_id AND role_id IN (1, 2)) THEN
        RAISE EXCEPTION 'User % is not allowed to approve leave', p_approver_id;
    END IF;

    UPDATE leave_requests
    SET status = 'APPROVED', approved_by = p_approver_id
    WHERE leave_id = p_leave_id;

    INSERT INTO attendance (user_id, date, check_in, check_out, status)
    SELECT req.user_id, d::DATE, NULL, NULL, 'ON_LEAVE'
    FROM generate_series(req.start_date, req.end_date, INTERVAL '1 day') AS d
    WHERE EXTRACT(ISODOW FROM d) < 6                       -- weekdays only
    ON CONFLICT (user_id, date)
    DO UPDATE SET status = 'ON_LEAVE', check_in = NULL, check_out = NULL;
END;
$$;


-- ---------------------------------------------------------------------
-- 5. VIEWS (used by the API and dashboard)
-- ---------------------------------------------------------------------

-- Everything about an employee in one row.
CREATE VIEW v_employee_details AS
SELECT u.user_id,
       u.first_name || ' ' || u.last_name AS full_name,
       u.email,
       r.role_name,
       d.department_name,
       u.manager_id,
       u.joining_date,
       u.status,
       u.salary,
       p.age, p.gender, p.marital_status, p.job_role, p.job_level,
       p.monthly_income, p.overtime, p.job_satisfaction, p.environment_satisfaction,
       p.work_life_balance, p.years_at_company, p.years_since_last_promotion,
       p.attrition
FROM users u
JOIN roles r                  ON r.role_id = u.role_id
LEFT JOIN departments d       ON d.department_id = u.department_id
LEFT JOIN employee_profiles p ON p.user_id = u.user_id;

-- Headcount, attrition and pay per department.
CREATE VIEW v_department_summary AS
SELECT d.department_id,
       d.department_name,
       COUNT(u.user_id)                                          AS total_employees,
       COUNT(*) FILTER (WHERE u.status = 'ACTIVE')               AS active_employees,
       COUNT(*) FILTER (WHERE p.attrition)                       AS employees_left,
       ROUND(100.0 * AVG(p.attrition::INT), 2)                   AS attrition_rate_pct,
       ROUND(AVG(p.monthly_income), 2)                           AS avg_monthly_income,
       ROUND(100.0 * AVG(p.overtime::INT), 2)                    AS overtime_pct,
       ROUND(AVG(p.job_satisfaction), 2)                         AS avg_job_satisfaction
FROM departments d
LEFT JOIN users u             ON u.department_id = d.department_id
LEFT JOIN employee_profiles p ON p.user_id = u.user_id
GROUP BY d.department_id, d.department_name;

-- Attrition by job role (which roles lose the most people).
CREATE VIEW v_attrition_by_job_role AS
SELECT p.job_role,
       COUNT(*)                                  AS total_employees,
       COUNT(*) FILTER (WHERE p.attrition)       AS employees_left,
       ROUND(100.0 * AVG(p.attrition::INT), 2)   AS attrition_rate_pct,
       ROUND(100.0 * AVG(p.overtime::INT), 2)    AS overtime_pct,
       ROUND(AVG(p.monthly_income), 2)           AS avg_monthly_income
FROM employee_profiles p
GROUP BY p.job_role;

-- Attendance over the last 30 days for each active employee.
CREATE VIEW v_attendance_summary AS
SELECT u.user_id,
       u.first_name || ' ' || u.last_name                    AS full_name,
       u.department_id,
       COUNT(a.attendance_id)                                 AS days_recorded,
       COUNT(*) FILTER (WHERE a.status = 'PRESENT')           AS present_days,
       COUNT(*) FILTER (WHERE a.status = 'LATE')              AS late_days,
       COUNT(*) FILTER (WHERE a.status = 'ABSENT')            AS absent_days,
       COUNT(*) FILTER (WHERE a.status = 'ON_LEAVE')          AS leave_days,
       ROUND(100.0 * COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE'))
             / NULLIF(COUNT(a.attendance_id), 0), 2)          AS attendance_rate_pct
FROM users u
LEFT JOIN attendance a
       ON a.user_id = u.user_id AND a.date >= CURRENT_DATE - 30
WHERE u.status = 'ACTIVE'
GROUP BY u.user_id, u.first_name, u.last_name, u.department_id;

-- Leave balance per employee per leave type for the current year.
CREATE VIEW v_leave_balance AS
SELECT u.user_id,
       lt.type_name,
       lt.max_days,
       COALESCE(SUM(lr.end_date - lr.start_date + 1)
                FILTER (WHERE lr.status = 'APPROVED'), 0)     AS days_taken,
       COALESCE(SUM(lr.end_date - lr.start_date + 1)
                FILTER (WHERE lr.status = 'PENDING'), 0)      AS days_pending,
       lt.max_days - COALESCE(SUM(lr.end_date - lr.start_date + 1)
                FILTER (WHERE lr.status <> 'REJECTED'), 0)    AS days_remaining
FROM users u
CROSS JOIN leave_types lt
LEFT JOIN leave_requests lr
       ON lr.user_id = u.user_id
      AND lr.leave_type_id = lt.leave_type_id
      AND EXTRACT(YEAR FROM lr.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
WHERE u.status = 'ACTIVE'
GROUP BY u.user_id, lt.leave_type_id, lt.type_name, lt.max_days;


-- ---------------------------------------------------------------------
-- 6. ATTRITION PREDICTIONS (filled by backend/ml/train_model.py)
-- ---------------------------------------------------------------------

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
