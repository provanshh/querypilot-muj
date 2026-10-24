-- QueryPilot: a read-only login for the agents (optional, recommended for production).
-- The app already wraps every agent query in BEGIN READ ONLY and a SQL safety check; this role makes the
-- database itself refuse writes too. Replace the password, then put this role's connection string in
-- DATABASE_URL_READONLY (keep DATABASE_URL as the owner for uploads and the run log).
-- CSV uploads grant SELECT on their schemas to qp_agent automatically once it exists.

CREATE ROLE qp_agent LOGIN PASSWORD 'change-me-to-a-long-random-password';
ALTER ROLE qp_agent SET default_transaction_read_only = on;
ALTER ROLE qp_agent SET statement_timeout = '8s';

-- Check: this must fail with "cannot execute INSERT in a read-only transaction".
-- SET ROLE qp_agent; CREATE TABLE public.qp_write_test (x int); RESET ROLE;
