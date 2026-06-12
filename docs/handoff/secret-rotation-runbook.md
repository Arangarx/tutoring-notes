# Secret Rotation Runbook — DRAFT

> **DRAFT** — for Andrew review before ratifying as an operational document.
>
> Rotation frequency: rotate on any suspected compromise + annually for high-value secrets.
> All rotations go to Vercel env first; redeploy is required to activate.

---

## Secret Inventory

| Secret | Env Var | Impact if compromised | Rotation cost | Notes |
|---|---|---|---|---|
| NextAuth signing key | `NEXTAUTH_SECRET` | Tutor/admin session forgery | All tutors re-login | Invalidates all JWT sessions immediately on rotation |
| AH session HMAC key | `AH_SESSION_HMAC_SECRET` | AccountHolder session forgery | All parents re-login | Stored hashes in `AccountHolderSession.tokenHash` become invalid |
| Learner session HMAC key | `LEARNER_SESSION_HMAC_SECRET` | Learner device session forgery | All children re-login | Stored hashes in `LearnerDeviceSession.tokenHash` become invalid |
| Tutor TOTP encryption key | `TOTP_ENCRYPTION_KEY` | Decryption of stored TOTP secrets (offline attack only) | All tutors re-enroll 2FA | See "TOTP Key Rotation" section |
| AH TOTP encryption key (Phase 6) | `AH_TOTP_ENCRYPTION_KEY` | Decryption of stored AH TOTP secrets | All parents re-enroll | Not yet used (Phase 6) |
| OpenAI API key | `OPENAI_API_KEY` | Cost amplification; transcription data | Redeploy only | Rotate in OpenAI dashboard first |
| Vercel Blob token | `BLOB_READ_WRITE_TOKEN` | Read/write access to all private audio/whiteboard blobs | Redeploy only | Rotate in Vercel Storage dashboard |
| Neon database URL | `DATABASE_URL` | Full DB read/write access | Redeploy; update all connections | Rotate in Neon dashboard; update preview + prod |
| Cron secret | `CRON_SECRET` | Unauthorized cron/queue endpoint invocation | Redeploy only | Also used as bearer guard on `/api/queues/chunk-transcribe` |
| Google OAuth client secret | `GOOGLE_CLIENT_SECRET` | OAuth impersonation for Gmail Connect | Redeploy; update Google Cloud Console | Rotate in Google Cloud Console |
| SMTP credentials | `SMTP_PASS` | Email sending abuse | Redeploy | Rotate with email provider |

---

## Standard Rotation (most secrets)

For `NEXTAUTH_SECRET`, `AH_SESSION_HMAC_SECRET`, `LEARNER_SESSION_HMAC_SECRET`, `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `SMTP_PASS`:

```bash
# 1. Generate a new secret (32 bytes minimum)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 2. Update in Vercel dashboard:
#    Project → Settings → Environment Variables → update the var → Save

# 3. Trigger a redeployment:
#    Vercel dashboard → Deployments → Redeploy last production deployment
#    OR push a commit to trigger auto-deploy

# 4. Verify the app is healthy:
#    - Login flow works
#    - Whiteboard session works
#    - Audio upload works (if rotating BLOB_READ_WRITE_TOKEN)
```

**For `NEXTAUTH_SECRET`:** All active NextAuth sessions are invalidated immediately. Tutors will be logged out and must re-login. Sarah must be notified in advance if possible.

**For `AH_SESSION_HMAC_SECRET`:** All `AccountHolderSession` rows have `tokenHash` values derived from the old secret. After rotation, those hashes no longer match — every AccountHolder session becomes invalid. All parents must re-login. Optionally, run `DELETE FROM "AccountHolderSession" WHERE "revokedAt" IS NULL;` to clean up the now-orphaned rows (they won't validate anyway, but cleaning up reduces confusion in DB queries).

**For `LEARNER_SESSION_HMAC_SECRET`:** Same as AH above but for `LearnerDeviceSession` rows.

---

## TOTP Key Rotation (`TOTP_ENCRYPTION_KEY`)

Rotating the TOTP encryption key requires **re-enrolling all tutors** because the stored `AdminUser2FA.totpSecretEnc` values are encrypted with the old key and cannot be decrypted with the new one.

**Steps:**

1. Notify all affected tutors in advance (schedule a maintenance window).
2. Generate a new 32-byte base64url key:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
3. Update `TOTP_ENCRYPTION_KEY` in Vercel env.
4. Delete the `AdminUser2FA` rows (this forces re-enrollment):
   ```sql
   -- Confirm first in Neon console:
   SELECT id, "adminUserId", "confirmedAt" FROM "AdminUser2FA";
   -- Then delete:
   DELETE FROM "AdminUser2FA";
   DELETE FROM "AdminUser2FABackupCode";
   ```
5. Redeploy.
6. Each tutor navigates to `/admin/settings/2fa/setup` to re-enroll.
7. Verify: after re-enrollment, the 2FA gate passes on next login.

---

## Neon Database URL Rotation

The database URL contains credentials that allow full read/write access.

1. In Neon dashboard: create a new role or rotate the existing role password.
2. Update `DATABASE_URL` in Vercel env (production + preview).
3. Redeploy production.
4. Verify connectivity: check that the app starts without `"Invalid env"` errors.

**Note:** If `DATABASE_URL` rotation is triggered by a suspected breach, also rotate `AH_SESSION_HMAC_SECRET` and `LEARNER_SESSION_HMAC_SECRET` (an attacker with DB read access could have exfiltrated token hashes — though HMAC ensures the hashes are useless without the signing key, rotating both together eliminates the residual risk).

---

## Google OAuth Client Secret

1. In Google Cloud Console: APIs & Services → Credentials → OAuth 2.0 Client IDs → Edit → Regenerate secret.
2. Update `GOOGLE_CLIENT_SECRET` in Vercel env.
3. Redeploy.
4. Verify: Google OAuth login and Gmail Connect flow work.

---

## Vercel Blob Token (`BLOB_READ_WRITE_TOKEN`)

1. In Vercel Storage dashboard: the Blob store → Settings → Tokens → Create new token.
2. Delete the old token.
3. Update `BLOB_READ_WRITE_TOKEN` in Vercel env.
4. Redeploy.
5. Verify: audio upload works, whiteboard replay loads (both proxy through this token server-side).

**Note:** Existing blob URLs remain valid. The token only controls server-to-blob authorization, not URL validity.

---

## Post-Rotation Checklist

After any secret rotation:

- [ ] New secret deployed to Vercel (production).
- [ ] App redeployed and healthy (check Vercel dashboard for build/runtime errors).
- [ ] Login flow tested (tutor + parent + learner where applicable).
- [ ] Core user flow tested (start session, whiteboard, end session, notes).
- [ ] Old secret deleted from Vercel (not just updated — ensure no rollback path).
- [ ] Post-rotation log entry in `docs/handoff/` (date, reason, who rotated).
