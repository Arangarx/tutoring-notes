-- IAC-10: Durable learner PIN rate limiter (Neon-backed).
--
-- Moves the in-memory Map/Set state from learner-pin-rate-limit.ts into Neon
-- Postgres so hard lock + soft cooldown survive Vercel cold starts and are
-- shared across concurrent serverless instances.
--
-- Additive: creates a new table only. No existing tables are altered.

CREATE TABLE IF NOT EXISTS "LearnerLoginThrottle" (
  "id"            TEXT NOT NULL,
  "scopeKey"      TEXT NOT NULL,
  "kind"          TEXT NOT NULL,
  "failureCount"  INTEGER NOT NULL DEFAULT 0,
  "cooldownUntil" TIMESTAMPTZ,
  "hardLockedAt"  TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "LearnerLoginThrottle_pkey" PRIMARY KEY ("id")
);

-- Unique index on scopeKey (the ON CONFLICT target for atomic upserts)
CREATE UNIQUE INDEX IF NOT EXISTS "LearnerLoginThrottle_scopeKey_key"
  ON "LearnerLoginThrottle"("scopeKey");

-- Index for cleanup sweeps and admin queries (e.g. purge stale soft rows)
CREATE INDEX IF NOT EXISTS "LearnerLoginThrottle_kind_updatedAt_idx"
  ON "LearnerLoginThrottle"("kind", "updatedAt");
