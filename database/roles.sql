-- =====================================================================
-- WorkForceIQ: database-level role-based access control
--
-- Run once in pgAdmin (Query Tool on WorkForceIQ) AFTER schema.sql.
-- Safe to run again. It does not change any data.
--
-- The web app enforces access in the API (JWT login + role checks).
-- This script shows the same idea inside PostgreSQL itself:
--   1. group roles          CREATE ROLE wfiq_admin / wfiq_manager / wfiq_employee
--   2. privileges           GRANT / REVOKE on tables, views, sequences, procedure
--   3. row-level security   policies so a manager sees only their department's
--                           rows and an employee only their own
-- (The app connects as the table owner, which RLS does not restrict, so running
--  this script does not affect the website.)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Group roles (NOLOGIN: they hold privileges, people or apps get granted them)
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wfiq_admin') THEN
        CREATE ROLE wfiq_admin NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wfiq_manager') THEN
        CREATE ROLE wfiq_manager NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wfiq_employee') THEN
        CREATE ROLE wfiq_employee NOLOGIN;
    END IF;
END $$;

-- lets the account running this script switch into each role for testing (SET ROLE)
GRANT wfiq_admin, wfiq_manager, wfiq_employee TO CURRENT_USER;


-- ---------------------------------------------------------------------
-- 2. Privileges: start from nothing, then grant only what each role needs
-- ---------------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM wfiq_admin, wfiq_manager, wfiq_employee;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM wfiq_admin, wfiq_manager, wfiq_employee;
GRANT USAGE ON SCHEMA public TO wfiq_admin, wfiq_manager, wfiq_employee;

-- Admin: full read/write on every table and view
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO wfiq_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO wfiq_admin;

-- Manager: read HR data and analytics, manage leave and attendance. No audit log.
GRANT SELECT ON roles, departments, users, employee_profiles, attendance, leave_types,
                leave_requests, performance_reviews, attrition_predictions TO wfiq_manager;
GRANT SELECT ON v_employee_details, v_department_summary, v_attrition_by_job_role,
                v_attendance_summary, v_leave_balance, v_attrition_risk TO wfiq_manager;
GRANT INSERT, UPDATE ON leave_requests, attendance TO wfiq_manager;
GRANT USAGE ON SEQUENCE leave_requests_leave_id_seq, attendance_attendance_id_seq TO wfiq_manager;

-- Employee: only leave and attendance (rows limited further by RLS below). No predictions,
-- no salaries of other people, no audit log.
GRANT SELECT ON departments, leave_types, leave_requests, attendance TO wfiq_employee;
GRANT INSERT ON leave_requests TO wfiq_employee;
GRANT USAGE ON SEQUENCE leave_requests_leave_id_seq TO wfiq_employee;

-- Only admins and managers may run the approval transaction
REVOKE EXECUTE ON PROCEDURE approve_leave(INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON PROCEDURE approve_leave(INT, INT) TO wfiq_admin, wfiq_manager;

-- The audit trigger must still write to audit_logs when a manager changes data, even though
-- managers cannot read or write audit_logs directly. SECURITY DEFINER makes the trigger run
-- with its owner's rights; a fixed search_path keeps that safe.
ALTER FUNCTION fn_audit_log() SECURITY DEFINER;
ALTER FUNCTION fn_audit_log() SET search_path = public;


-- ---------------------------------------------------------------------
-- 3. Row-level security on leave_requests and attendance
--    The session says who it is with:  SELECT set_config('app.user_id', '25', true);
--                                       SELECT set_config('app.department_id', '2', true);
-- ---------------------------------------------------------------------
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_all_leave      ON leave_requests;
DROP POLICY IF EXISTS manager_dept_leave   ON leave_requests;
DROP POLICY IF EXISTS employee_own_leave   ON leave_requests;
DROP POLICY IF EXISTS admin_all_att        ON attendance;
DROP POLICY IF EXISTS manager_dept_att     ON attendance;
DROP POLICY IF EXISTS employee_own_att     ON attendance;

-- admin: every row
CREATE POLICY admin_all_leave ON leave_requests FOR ALL TO wfiq_admin USING (true) WITH CHECK (true);
CREATE POLICY admin_all_att   ON attendance     FOR ALL TO wfiq_admin USING (true) WITH CHECK (true);

-- manager: rows belonging to people in their department
CREATE POLICY manager_dept_leave ON leave_requests FOR ALL TO wfiq_manager
    USING (EXISTS (SELECT 1 FROM users u
                   WHERE u.user_id = leave_requests.user_id
                     AND u.department_id = NULLIF(current_setting('app.department_id', true), '')::INT))
    WITH CHECK (EXISTS (SELECT 1 FROM users u
                   WHERE u.user_id = leave_requests.user_id
                     AND u.department_id = NULLIF(current_setting('app.department_id', true), '')::INT));

CREATE POLICY manager_dept_att ON attendance FOR ALL TO wfiq_manager
    USING (EXISTS (SELECT 1 FROM users u
                   WHERE u.user_id = attendance.user_id
                     AND u.department_id = NULLIF(current_setting('app.department_id', true), '')::INT))
    WITH CHECK (EXISTS (SELECT 1 FROM users u
                   WHERE u.user_id = attendance.user_id
                     AND u.department_id = NULLIF(current_setting('app.department_id', true), '')::INT));

-- employee: only their own rows
CREATE POLICY employee_own_leave ON leave_requests FOR ALL TO wfiq_employee
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::INT)
    WITH CHECK (user_id = NULLIF(current_setting('app.user_id', true), '')::INT);

CREATE POLICY employee_own_att ON attendance FOR SELECT TO wfiq_employee
    USING (user_id = NULLIF(current_setting('app.user_id', true), '')::INT);


-- =====================================================================
-- TRY IT (run each block separately in the Query Tool; ROLLBACK undoes everything)
-- =====================================================================

-- A) An employee sees only their own leave, and is blocked from the audit log
-- BEGIN;
--   SET LOCAL ROLE wfiq_employee;
--   SELECT set_config('app.user_id', '25', true);
--   SELECT leave_id, user_id, status FROM leave_requests;   -- only user 25's rows
--   SELECT * FROM audit_logs;                                -- ERROR: permission denied
-- ROLLBACK;

-- B) A manager sees only their department's leave requests
-- BEGIN;
--   SET LOCAL ROLE wfiq_manager;
--   SELECT set_config('app.department_id', '2', true);
--   SELECT lr.leave_id, u.department_id FROM leave_requests lr JOIN users u USING (user_id);
-- ROLLBACK;

-- C) An employee cannot sneak in a leave request for someone else
-- BEGIN;
--   SET LOCAL ROLE wfiq_employee;
--   SELECT set_config('app.user_id', '25', true);
--   INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date)
--   VALUES (30, 1, '2026-12-01', '2026-12-01');             -- ERROR: violates row-level security policy
-- ROLLBACK;
