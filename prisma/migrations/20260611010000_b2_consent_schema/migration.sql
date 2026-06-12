-- B2 Parent Privacy Consent — additive schema migration
-- Creates three new tables: ConsentRecord, ConsentRestriction, SessionConsentSnapshot
-- Adds relations to LearnerProfile, AdminUser, WhiteboardSession
-- ADDITIVE ONLY: no existing columns/tables are modified or dropped.
-- Enforcement is dormant until CONSENT_ENFORCEMENT=true env var is set.

-- ConsentRecord: versioned per-tutor consent from parent
CREATE TABLE "ConsentRecord" (
    "id"                       TEXT NOT NULL,
    "learnerProfileId"         TEXT NOT NULL,
    "adminUserId"              TEXT NOT NULL,
    "version"                  INTEGER NOT NULL,
    "allowLiveSession"         BOOLEAN NOT NULL,
    "allowAudioRecording"      BOOLEAN NOT NULL,
    "allowWhiteboardRecording" BOOLEAN NOT NULL,
    "allowNoteSending"         BOOLEAN NOT NULL,
    "setByAccountHolderId"     TEXT NOT NULL,
    "captureMethod"            TEXT NOT NULL DEFAULT 'electronic',
    "setAt"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- ConsentRestriction: child-narrowing floor (all defaults false = no restrictions)
CREATE TABLE "ConsentRestriction" (
    "id"                          TEXT NOT NULL,
    "learnerProfileId"            TEXT NOT NULL,
    "restrictAudioRecording"      BOOLEAN NOT NULL DEFAULT false,
    "restrictWhiteboardRecording" BOOLEAN NOT NULL DEFAULT false,
    "restrictNoteSending"         BOOLEAN NOT NULL DEFAULT false,
    "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsentRestriction_pkey" PRIMARY KEY ("id")
);

-- SessionConsentSnapshot: frozen consent at session start (legal record)
CREATE TABLE "SessionConsentSnapshot" (
    "id"                       TEXT NOT NULL,
    "whiteboardSessionId"      TEXT NOT NULL,
    "allowLiveSession"         BOOLEAN NOT NULL,
    "allowAudioRecording"      BOOLEAN NOT NULL,
    "allowWhiteboardRecording" BOOLEAN NOT NULL,
    "allowNoteSending"         BOOLEAN NOT NULL,
    "consentRecordId"          TEXT,
    "consentRecordVersion"     INTEGER,
    "frozenAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionConsentSnapshot_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "ConsentRecord_learnerProfileId_adminUserId_version_key"
    ON "ConsentRecord"("learnerProfileId", "adminUserId", "version");

CREATE UNIQUE INDEX "ConsentRestriction_learnerProfileId_key"
    ON "ConsentRestriction"("learnerProfileId");

CREATE UNIQUE INDEX "SessionConsentSnapshot_whiteboardSessionId_key"
    ON "SessionConsentSnapshot"("whiteboardSessionId");

-- Indexes
CREATE INDEX "ConsentRecord_learnerProfileId_adminUserId_idx"
    ON "ConsentRecord"("learnerProfileId", "adminUserId");

-- Foreign keys (onDelete: Restrict for legal records, Cascade for restriction)
ALTER TABLE "ConsentRecord"
    ADD CONSTRAINT "ConsentRecord_learnerProfileId_fkey"
    FOREIGN KEY ("learnerProfileId")
    REFERENCES "LearnerProfile"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsentRecord"
    ADD CONSTRAINT "ConsentRecord_adminUserId_fkey"
    FOREIGN KEY ("adminUserId")
    REFERENCES "AdminUser"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConsentRestriction"
    ADD CONSTRAINT "ConsentRestriction_learnerProfileId_fkey"
    FOREIGN KEY ("learnerProfileId")
    REFERENCES "LearnerProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionConsentSnapshot"
    ADD CONSTRAINT "SessionConsentSnapshot_whiteboardSessionId_fkey"
    FOREIGN KEY ("whiteboardSessionId")
    REFERENCES "WhiteboardSession"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
