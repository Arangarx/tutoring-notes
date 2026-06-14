-- AddAdminTrustedDevice: trusted-browser record for admin/tutor 2FA 30-day login skip.
-- ADDITIVE ONLY — no existing tables, columns, or indexes are modified.
-- Raw device token is never stored; only HMAC-SHA-256 hash persisted.

CREATE TABLE "AdminTrustedDevice" (
    "id"          TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tokenHash"   TEXT NOT NULL,
    "deviceLabel" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "revokedAt"   TIMESTAMP(3),

    CONSTRAINT "AdminTrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminTrustedDevice_tokenHash_key" ON "AdminTrustedDevice"("tokenHash");
CREATE INDEX "AdminTrustedDevice_adminUserId_idx" ON "AdminTrustedDevice"("adminUserId");
CREATE INDEX "AdminTrustedDevice_adminUserId_revokedAt_idx" ON "AdminTrustedDevice"("adminUserId", "revokedAt");

ALTER TABLE "AdminTrustedDevice" ADD CONSTRAINT "AdminTrustedDevice_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
