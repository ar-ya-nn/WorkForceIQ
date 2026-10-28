-- =====================================================================
-- WorkForceIQ update v3 (run once, after update_v2.sql, on local pgAdmin AND Neon)
-- Adds a JSONB column that stores, for every scored employee, the factors pushing
-- their attrition risk up or down. Used by the "Why?" explanations on the website.
-- Safe: adds one column, no data is changed.
-- After running it, retrain the model once (Administration -> ML model -> Retrain now,
-- or: python -m backend.ml.train_model) so the explanations get filled in.
-- =====================================================================

ALTER TABLE attrition_predictions ADD COLUMN IF NOT EXISTS explanation JSONB;
