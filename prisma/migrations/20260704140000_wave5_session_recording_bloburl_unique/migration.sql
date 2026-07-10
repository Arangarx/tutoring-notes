-- WS-A SF-1: close dup-row race between onSegmentUploaded and end-session createMany.
CREATE UNIQUE INDEX "SessionRecording_whiteboardSessionId_blobUrl_key" ON "SessionRecording"("whiteboardSessionId", "blobUrl");
