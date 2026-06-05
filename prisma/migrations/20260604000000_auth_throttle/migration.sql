-- IAC-11: Durable operator auth rate limiters (MEDIUM-severity, Neon-backed).
--
-- Ports the in-memory `auth:<ip>` and `2fa:<ip>` sliding-window counters from
-- src/middleware.ts into Neon Postgres so rate-limit state survives Vercel cold
-- starts and accumulates correctly across concurrent serverless instances.
--
-- Stable-key rationale: x-forwarded-for varies across Vercel proxy hops so
-- per-IP keys reset on every request in practice. Email and adminUserId are
-- stable per-session identity keys that accumulate correctly (same lesson learned
-- fixing LearnerLoginThrottle soft-key in migration 20260603000000).
--
-- Row kinds:
--   kind="ah-login"   scopeKey="ah-login:<normalizedEmail>"   — 10 req/60s
--   kind="2fa-verify" scopeKey="2fa-verify:<adminUserId>"     — 20 req/60s
--
-- Additive: creates a new table only. No existing tables are altered.

CREATE TABLE IF NOT EXISTS "AuthThrottle" (
  "id"            TEXT        NOT NULL,
  "scopeKey"      TEXT        NOT NULL,
  "kind"          TEXT        NOT NULL,
  "requestCount"  INTEGER     NOT NULL DEFAULT 0,
  "windowResetAt" TIMESTAMPTZ NOT NULL,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("id")
);

-- Unique index on scopeKey (the ON CONFLICT target for atomic upserts)
CREATE UNIQUE INDEX IF NOT EXISTS "AuthThrottle_scopeKey_key"
  ON "AuthThrottle"("scopeKey");

-- Index for cleanup sweeps and admin queries (e.g. purge stale rows)
CREATE INDEX IF NOT EXISTS "AuthThrottle_kind_updatedAt_idx"
  ON "AuthThrottle"("kind", "updatedAt");
