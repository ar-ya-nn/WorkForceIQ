-- Optional: only needed if you ran update_v4.sql earlier (local pgAdmin or Neon).
-- Removes the unfinished retention-planner tables, view and triggers. Safe to run if they don't exist.
DROP VIEW IF EXISTS v_intervention_effectiveness;
DROP TABLE IF EXISTS plan_actions, retention_plans, intervention_types CASCADE;
DROP FUNCTION IF EXISTS fn_plan_action_stamp() CASCADE;
DROP FUNCTION IF EXISTS fn_plan_progress() CASCADE;
