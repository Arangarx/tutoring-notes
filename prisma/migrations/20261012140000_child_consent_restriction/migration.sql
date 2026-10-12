-- Child can tighten any of the four consent switches. Parent clear is visible to the child.
ALTER TABLE "ConsentRestriction"
    ADD COLUMN "restrictLiveSession" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "parentRestoredLiveSession" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "parentRestoredAudioRecording" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "parentRestoredWhiteboardRecording" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "parentRestoredNoteSending" BOOLEAN NOT NULL DEFAULT false;
