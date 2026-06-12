# Incident Response Runbook — DRAFT

> **DRAFT** — for Andrew review before ratifying as an operational document.

## Classification

| Tier | Criteria | SLA |
|---|---|---|
| P0 | Student data leaked, auth bypass confirmed, active exploit in progress | Respond immediately, contain < 1h |
| P1 | Credential compromise suspected, anomalous access pattern, service down for all users | Respond < 2h |
| P2 | Single account issue, suspicious activity unconfirmed, degraded functionality | Respond < 24h |

---

## Step 1: Detect

### Indicators to watch in Vercel logs (search log prefix):

| Prefix | Anomaly to look for |
|---|---|
| `[ahx]` | Repeated `action=session_invalid reason=notfound` — token enumeration; `action=login` from unusual location |
| `[alr]` | `action=rate-limited` for same email across many windows — credential stuffing |
| `[lpr]` | `action=hard_lock_triggered` unexpected; `action=login_failed` spike on a single handle |
| `[sal]` | `action=ownership_denied` spike — share token fishing |
| `[imp]` | `action=impersonation_start` at unexpected times |
| `[tfa]` | `action=verify-fail` spike on a single adminUserId — 2FA brute force |
| `[uploadBlob.route]` | Repeated `handleUpload threw` at high volume — upload token farming |
| `[txc]` | `action=queue_auth_rejected` spike — external probe on chunk-transcribe endpoint |

### Check Vercel Edge Config / Neon logs:
- Neon metrics: unexpected query spike or connection saturation
- Vercel: unusual 429 volume (rate limit hit), 401 volume

---

## Step 2: Contain

### Suspicious account activity (P0/P1)

1. **Tombstone the account** (sets `tombstonedAt`; all session validations return null → 401 immediately):
   ```sql
   -- Run via Neon console / staging branch first to verify
   UPDATE "AccountHolder" SET "tombstonedAt" = NOW() WHERE email = '<email>';
   ```

2. **Bulk-revoke all AccountHolder sessions** for the account:
   ```sql
   UPDATE "AccountHolderSession" SET "revokedAt" = NOW() WHERE "accountHolderId" = '<id>' AND "revokedAt" IS NULL;
   ```

3. **Revoke child (learner) sessions** if the account has children:
   ```sql
   UPDATE "LearnerDeviceSession" SET "revokedAt" = NOW()
   WHERE "learnerProfileId" IN (
     SELECT id FROM "LearnerProfile" WHERE "accountHolderId" = '<id>'
   ) AND "revokedAt" IS NULL;
   ```

### Tutor/admin (NextAuth realm) compromise (P0/P1)

1. **Reset password** via `/reset-password` flow (revokes all sessions atomically).
2. **Revoke 2FA enrollment** if suspect:
   - Delete `AdminUser2FA` row for the admin user.
   - Rotate `TOTP_ENCRYPTION_KEY` (re-enrollment required for all tutors — see secret rotation runbook).
3. **Force re-login** (resetting password revokes all NextAuth sessions via `nextauth` callback on next request).

### Service-wide lock (P0 active exploit)

If an exploit is in progress and cannot be isolated to one account:

1. **Set `NOTES_AUTH_WALL=true`** in Vercel env → require authenticated sessions for all `/s/*` share pages.
2. **Rotate `NEXTAUTH_SECRET`** → invalidates all tutor/admin JWT sessions instantly. All users must re-login.
3. **Rotate `AH_SESSION_HMAC_SECRET`** + `LEARNER_SESSION_HMAC_SECRET` → invalidates all AccountHolder and Learner sessions. All users must re-login.
4. Optionally: **disable signup** temporarily by setting `SETUP_SECRET` to a random value + removing the signup link from the UI (code change + redeploy).

---

## Step 3: Investigate

1. Pull Vercel logs for the incident window (filter by relevant prefix).
2. Query `AccountHolderSession` / `LearnerDeviceSession` for `deviceInfo` patterns on the suspected account.
3. Check `NoteView` for unexpected share-token access patterns.
4. Check `AuthThrottle` for rate-limit events keyed to the compromised identity.
5. If student data accessed via `/api/audio/*` or `/api/whiteboard/*/public-events*`: confirm `sal=` log shows `access_granted` vs `access_denied` for the relevant tokens.

---

## Step 4: Remediate

After containing:

1. **Rotate affected secrets** per the Secret Rotation Runbook below.
2. **Review auth logs** for lateral movement (did the attacker access other students?).
3. **Notify affected users** per your privacy policy obligations.
4. **Write a post-mortem** in `docs/handoff/` — capture: timeline, root cause, fix, process improvement.
5. **Update BACKLOG.md** with any hardening items surfaced.

---

## Step 5: Verify Containment

Before declaring the incident closed:

- [ ] Confirm `tombstonedAt` is set for affected accounts (if applicable).
- [ ] Confirm all sessions for affected accounts show `revokedAt` is non-null.
- [ ] Confirm new logins for affected accounts fail (401 as expected).
- [ ] Confirm Vercel logs show no further anomalous activity.
- [ ] New secrets deployed to Vercel env (if rotated).

---

## Contact / Escalation

*(Fill in when the team grows)*

- Andrew: primary responder for all incidents at pilot scale.
- Sarah: notify if her student data is involved.
