-- Runs once, only against a fresh (empty) postgres-data volume, per Postgres's
-- docker-entrypoint-initdb.d convention. Existing volumes won't pick this up;
-- packages/db/src/testing.ts's ensureTestDatabase() creates the DB at runtime
-- instead so the harness works regardless of when the volume was created.
CREATE DATABASE office_lunch_test;
