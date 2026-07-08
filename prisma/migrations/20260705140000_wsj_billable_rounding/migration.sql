-- WS-J: billable time rounding — additive nullable columns only.

ALTER TABLE "AdminUser" ADD COLUMN "defaultRoundingIncrementMin" INTEGER;
ALTER TABLE "AdminUser" ADD COLUMN "defaultRoundingMode" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN "tutorTimezone" TEXT;

ALTER TABLE "WhiteboardSession" ADD COLUMN "roundingIncrementMin" INTEGER;
ALTER TABLE "WhiteboardSession" ADD COLUMN "roundingMode" TEXT;
ALTER TABLE "WhiteboardSession" ADD COLUMN "billedDurationMin" INTEGER;
ALTER TABLE "WhiteboardSession" ADD COLUMN "billedStartLocal" TEXT;
ALTER TABLE "WhiteboardSession" ADD COLUMN "billedEndLocal" TEXT;
ALTER TABLE "WhiteboardSession" ADD COLUMN "sessionDateLocal" TEXT;
ALTER TABLE "WhiteboardSession" ADD COLUMN "tutorTimezone" TEXT;
