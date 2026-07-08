-- WS-G: nullable concat replay blob on WhiteboardSession (additive).
ALTER TABLE "WhiteboardSession" ADD COLUMN "concatBlobUrl" TEXT;
ALTER TABLE "WhiteboardSession" ADD COLUMN "concatDurationSeconds" INTEGER;
