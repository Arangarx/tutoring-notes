-- WS3: persist Google Calendar reconnect signal after invalid_grant (additive only).
ALTER TABLE "OAuthCalendarConnection" ADD COLUMN "reconnectRequiredAt" TIMESTAMP(3);
