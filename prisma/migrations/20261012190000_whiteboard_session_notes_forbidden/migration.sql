-- Additive. Andrew approved WhiteboardSession.notesForbidden on 2026-10-12.
ALTER TABLE "WhiteboardSession" ADD COLUMN "notesForbidden" BOOLEAN NOT NULL DEFAULT false;
