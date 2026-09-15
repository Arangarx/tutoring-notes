-- Tutor email allowlist — pre-approve signups by normalized email (additive only).

CREATE TABLE "TutorEmailAllowlist" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorEmailAllowlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TutorEmailAllowlist_email_key" ON "TutorEmailAllowlist"("email");

ALTER TABLE "TutorEmailAllowlist" ADD CONSTRAINT "TutorEmailAllowlist_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
