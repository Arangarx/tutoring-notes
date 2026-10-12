-- Which consent switches the child turned off. Distinct from a parent always-off limit.
ALTER TABLE "ConsentRestriction"
    ADD COLUMN "childSetLiveSession" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "childSetAudioRecording" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "childSetWhiteboardRecording" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "childSetNoteSending" BOOLEAN NOT NULL DEFAULT false;
