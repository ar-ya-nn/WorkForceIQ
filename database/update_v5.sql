-- =====================================================================
-- WorkForceIQ update v5: VIEWER role for Google sign-up
-- Run once on local pgAdmin AND on Neon. Safe to run more than once.
--
-- People who sign in with Google and have no account yet get a read-only
-- VIEWER account automatically: organisation-wide insights only, no
-- personal data. Admins can promote or deactivate them in Administration.
-- =====================================================================

INSERT INTO roles (role_id, role_name) VALUES (4, 'VIEWER')
ON CONFLICT (role_id) DO NOTHING;
