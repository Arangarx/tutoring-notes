# SEC-1 Admin Impersonation + Test-Account Isolation — Design Doc

> **Design date:** 2026-05-30
> **Authored by:** Sonnet 4.6 subagent, commissioned by Opus orchestrator
> **Worktree branch:** `feat/sec-1-design` (worktree: `sec1-design-a3f8c9d2`)
> **Requirements source:** [`docs/BACKLOG.md`](../BACKLOG.md) § Security, "SEC-1" entry (scoped 2026-05-28)
> **Structural template:** [`docs/handoff/w1-audio-durability-design-2026-05-27.md`](w1-audio-durability-design-2026-05-27.md)
> **Prerequisite reads:** [`src/auth-options.ts`](../../src/auth-options.ts), [`src/lib/auth-db.ts`](../../src/lib/auth-db.ts), [`src/lib/student-scope.ts`](../../src/lib/student-scope.ts), [`prisma/schema.prisma`](../../prisma/schema.prisma)

---

## Scope — three coupled surfaces

| Surface | Backlog ref | Status |
|---|---|---|
| 1. `isTestAccount` isolation + password-disabled gate | SEC-1 (1) (2) | Design only |
| 2. Impersonation endpoint + `ImpersonationLog` + exit banner | SEC-1 (3) (4) (5) | Design only |
| 3. Admin dashboard UI — test-user list + "Log in as" | SEC-1 (7) | Design only |

All three build on a shared `src/lib/impersonation.ts` helper layer, additive schema migrations, and a new NextAuth `GoogleProvider`.

---

## 1. Scope + threat model

### What impersonation is

Admin impersonation is a **first-party access capability**: a verified admin user (Andrew) can mint a NextAuth session as a designated test account, use the app exactly as that account would, then exit back to their own session. The pattern is industry-standard (Stripe, Auth0, Linear, Vercel all implement it). It is **not** an elevation path — the impersonating session has exactly the test account's permissions, no more.

### Who can do it

Only `AdminUser` rows where `isTestAccount = false` may initiate impersonation. `isTestAccount = true` accounts are **the impersonated** — they have no initiation capability. In v1 there is no separate `role` enum; `isTestAccount` is the sole discriminant.

### Abuse cases

| Threat | Surface | Mitigation |
|---|---|---|
| Test account submits password to log in | Auth layer | `authorize()` in CredentialsProvider rejects when `isTestAccount = true`; `passwordHash` is physically `null` |
| Test account calls `startImpersonation()` directly | Server action | `assertIsRealAdmin()` checks `isTestAccount` at the mutation boundary and throws before any write |
| Test account impersonates another test account | Server action | Same `assertIsRealAdmin()` gate |
| Privilege escalation via `originalAdminId` in JWT | JWT | `originalAdminId` is read-only metadata; authz checks everywhere use `session.user.id` (the impersonated account's id during the session) |
| Forged impersonation JWT | Cookie | Signed by `NEXTAUTH_SECRET`; same integrity guarantee as normal sessions |
| Session fixation on impersonation start | JWT minting | `mintImpersonationSession()` generates a brand-new token with new `iat`; old admin cookie overwritten atomically |
| Admin forgets to exit → long-lived impersonation | UX + audit | Persistent banner; `ImpersonationLog` rows with `endedAt = null` are detectable by the admin |
| Audit evasion — admin acts as test user without a trace | Audit log | Every start/exit writes an `ImpersonationLog` row; `imp=<logId>` log prefix fires on all transitions |
| Google OAuth open to arbitrary Google accounts | `signIn` callback | Callback rejects any Google email not present in DB as `isTestAccount = false` |

### Security invariants (all three dispatches must uphold these)

1. `isTestAccount = true` accounts cannot log in via password.
2. `isTestAccount = true` accounts cannot call `startImpersonation()`.
3. Every impersonation session is bounded by an `ImpersonationLog` row (`startedAt` always set; `endedAt` set on exit or detected as orphan).
4. The real admin's Google OAuth session is never directly accessible from the impersonation cookie.
5. After exit-impersonation, the session cookie is a fresh admin JWT — the impersonation JWT is replaced, not reused.
6. An expired impersonation token does not fall through to any admin access.

---

## 2. Auth model design

### 2a. `isTestAccount` + password-disabled gate

**Schema additions (additive — Dispatch A):**

```prisma
model AdminUser {
  // CHANGED: String → String? (nullable; test accounts have null hash)
  passwordHash  String?
  // NEW
  isTestAccount Boolean  @default(false)
  // ... all other fields unchanged ...
}
```

> **Deviation from BACKLOG assumption — BLOCKER for migration:** The BACKLOG says "null the password hash." The current schema has `passwordHash String` (non-nullable). Making it nullable requires `ALTER TABLE "AdminUser" ALTER COLUMN "passwordHash" DROP NOT NULL` — an additive structural change (existing rows keep their hashes; no data is lost). Dispatch A must include this migration. The executor must NOT skip it or work around it with a sentinel value (empty string, `"!"`, etc.) — nullable is the correct representation.

**Auth gate in `src/auth-options.ts` `authorize()`:**

```ts
async authorize(credentials) {
  const email = (credentials?.email ?? "").trim();
  const password = credentials?.password ?? "";
  if (!email || !password) return null;

  const hasDbAdmins = await hasAdminUsers();

  if (hasDbAdmins) {
    const admin = await getAdminByEmail(email);
    if (!admin) return null;
    // NEW: test accounts cannot log in via password
    if (admin.isTestAccount) return null;
    // NEW: Google-OAuth-only real admins have null passwordHash
    if (admin.passwordHash === null) return null;
    const ok = await verifyPassword(password, admin.passwordHash);
    if (!ok) return null;
    return { id: admin.id, email: admin.email, name: admin.displayName ?? "Admin" };
  }

  // Env-only fallback — unchanged
  if (env.ADMIN_EMAIL && env.ADMIN_PASSWORD) { ... }
  return null;
},
```

`verifyPassword` in `src/lib/auth-db.ts` must guard against a null hash before calling `bcrypt.compare`:

```ts
export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}
```

**New helper `createTestAccount` in `src/lib/auth-db.ts`:**

```ts
export async function createTestAccount(email: string, displayName?: string | null) {
  return db.adminUser.create({
    data: {
      email: email.trim().toLowerCase(),
      passwordHash: null,    // no password — impersonation only
      isTestAccount: true,
      displayName: displayName?.trim() || null,
    },
  });
}
```

### 2b. Impersonation server action — mutation-boundary auth check

New file **`src/lib/impersonation.ts`** (created in Dispatch A, fleshed out in Dispatch B).

Pattern mirrors `assertOwnsStudent` from `src/lib/student-scope.ts` — a single async function called at the top of every impersonation mutation.

```ts
// src/lib/impersonation.ts
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireStudentScope } from "@/lib/student-scope";

export class ImpersonationForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImpersonationForbiddenError";
  }
}

/**
 * Call at the start of any server action that initiates or manages impersonation.
 * Returns the real admin's id + email. Throws ImpersonationForbiddenError if:
 *   - caller is not logged in
 *   - caller is an env-only admin (no DB row)
 *   - caller is a test account
 */
export async function assertIsRealAdmin(): Promise<{ adminId: string; email: string }> {
  const scope = await requireStudentScope();
  if (scope.kind === "none") redirect("/login");

  if (scope.kind === "env") {
    // Env-only path has no DB row; impersonation requires a DB-backed real admin.
    throw new ImpersonationForbiddenError(
      "Env-only admin cannot use impersonation. Create a DB-backed admin via Google OAuth first."
    );
  }

  const admin = await db.adminUser.findUnique({
    where: { id: scope.adminId },
    select: { id: true, email: true, isTestAccount: true },
  });
  if (!admin || admin.isTestAccount) {
    throw new ImpersonationForbiddenError(
      "Test accounts cannot impersonate other users."
    );
  }

  return { adminId: admin.id, email: admin.email };
}
```

### 2c. Session-minting mechanism

NextAuth v4 with `strategy: "jwt"` stores the session as a signed cookie. The `encode` helper from `next-auth/jwt` lets us mint tokens programmatically; `cookies()` from `next/headers` (available in App Router server actions) sets the cookie.

```ts
// src/lib/impersonation.ts — continued

import { encode } from "next-auth/jwt";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

const SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";

const SESSION_MAX_AGE_S = 8 * 60 * 60; // 8 hours — matches NextAuth default

export async function mintImpersonationSession(opts: {
  targetId: string;
  targetEmail: string;
  originalAdminId: string;
  originalAdminEmail: string;
  impersonationLogId: string;
}): Promise<void> {
  const token = await encode({
    token: {
      sub: opts.targetId,
      email: opts.targetEmail,
      name: "Test Account",
      isTestAccount: true,
      isImpersonating: true,
      originalAdminId: opts.originalAdminId,
      originalAdminEmail: opts.originalAdminEmail,
      impersonationLogId: opts.impersonationLogId,
    },
    secret: env.NEXTAUTH_SECRET,
    maxAge: SESSION_MAX_AGE_S,
  });

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

export async function mintAdminSession(opts: {
  adminId: string;
  adminEmail: string;
}): Promise<void> {
  const token = await encode({
    token: {
      sub: opts.adminId,
      email: opts.adminEmail,
      name: "Admin",
      isTestAccount: false,
      // no impersonation fields — clean admin session
    },
    secret: env.NEXTAUTH_SECRET,
    maxAge: SESSION_MAX_AGE_S,
  });

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}
```

**JWT shape during impersonation:**

```json
{
  "sub": "<testAccountId>",
  "email": "<testAccountEmail>",
  "isTestAccount": true,
  "isImpersonating": true,
  "originalAdminId": "<realAdminId>",
  "originalAdminEmail": "<realAdminEmail>",
  "impersonationLogId": "<logRowId>",
  "iat": 1748000000,
  "exp": 1748028800
}
```

**`getStudentScope()` works without changes during impersonation.** `getStudentScope()` in `student-scope.ts` resolves scope by looking up `session.user.email` in the DB. During impersonation, `session.user.email` = test account's email → `getAdminByEmail(testEmail)` returns the test account's `AdminUser` row → scope = `{ kind: "admin", adminId: testAccountId }`. The test account sees only their own students/data. `assertOwnsWhiteboardSession` has an extra check (`session.adminUserId !== scope.adminId`) that also resolves correctly — no changes needed to either scope file.

**NextAuth callbacks must forward custom JWT fields:**

```ts
// src/auth-options.ts — additions to authOptions
callbacks: {
  async jwt({ token, user, account }) {
    if (user) {
      // CredentialsProvider: attach isTestAccount from the returned user object
      // (requires authorize() to return { ..., isTestAccount: boolean })
      token.isTestAccount = (user as any).isTestAccount ?? false;
    }
    if (account?.provider === "google" && user) {
      // Resolve DB id for Google-OAuth login
      const admin = await getAdminByEmail(user.email!);
      if (admin) {
        token.sub = admin.id;
        token.isTestAccount = admin.isTestAccount;
      }
    }
    // Impersonation fields are already in the token (set by mintImpersonationSession);
    // they persist across token refreshes without any extra logic here.
    return token;
  },
  async session({ session, token }) {
    if (session.user) {
      (session.user as any).id = token.sub;
      (session.user as any).isTestAccount = token.isTestAccount ?? false;
      (session.user as any).isImpersonating = (token as any).isImpersonating ?? false;
      (session.user as any).originalAdminId = (token as any).originalAdminId ?? null;
    }
    return session;
  },
},
```

**Type augmentation (`src/types/next-auth.d.ts` — new file):**

```ts
import "next-auth";
declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      isTestAccount?: boolean;
      isImpersonating?: boolean;
      originalAdminId?: string | null;
    };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    isTestAccount?: boolean;
    isImpersonating?: boolean;
    originalAdminId?: string | null;
    originalAdminEmail?: string | null;
    impersonationLogId?: string | null;
  }
}
```

### 2d. Exit-impersonation contract

```ts
// src/app/admin/actions/impersonate.ts (Dispatch B)
"use server";
import { getToken } from "next-auth/jwt";
// Note: getToken requires the raw request; use getServerSession to detect state,
// then read the cookie token directly via next-auth/jwt decode() for exit.

export async function exitImpersonation(): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!(session?.user as any)?.isImpersonating) {
    return; // Idempotent: not impersonating — no-op
  }

  // Decode current cookie to get impersonation metadata
  // (executor must use the appropriate next-auth/jwt decode path for App Router)
  const impersonationLogId = (session.user as any).impersonationLogId;
  const originalAdminId = (session.user as any).originalAdminId;
  const originalAdminEmail = (session.user as any).originalAdminEmail;

  // Close the audit log row
  if (impersonationLogId) {
    await db.impersonationLog.update({
      where: { id: impersonationLogId },
      data: { endedAt: new Date() },
    }).catch(() => {
      // Swallow: row may not exist (orphan cleanup); log and continue
      console.warn(`[imp] imp=${impersonationLogId} exit-log-update-failed (swallowed)`);
    });
    console.log(`[imp] imp=${impersonationLogId} exit admin=${originalAdminId}`);
  }

  // Replace cookie with a fresh admin session
  await mintAdminSession({ adminId: originalAdminId!, adminEmail: originalAdminEmail! });
  // redirect("/admin") — done in the client component after action resolves
}
```

**What restores:**
- Cookie is overwritten with a fresh JWT for `originalAdminId` / `originalAdminEmail`.
- New JWT has no impersonation fields; fresh `iat` and `exp`.
- `ImpersonationLog.endedAt` is set.

**What happens on token expiry mid-impersonation:**
- NextAuth session expires → cookie removed → request redirected to `/login`.
- `ImpersonationLog.endedAt` stays `null` (orphaned row).
- Admin must re-authenticate via Google OAuth; no data is leaked.
- Orphaned rows are detectable (see Open Question Q3).

**Session-fixation guarantee:**
- `mintImpersonationSession` always emits a brand-new JWT with new `iat`.
- The old admin cookie is overwritten by writing to the same cookie name.
- No way to replay the old admin JWT — it was valid but no longer the current cookie.

### 2e. Admin-only authorization — double enforcement

| Layer | Mechanism |
|---|---|
| Server (primary) | `assertIsRealAdmin()` at top of `startImpersonation()` — throws `ImpersonationForbiddenError` if `isTestAccount = true` |
| Server (secondary) | `authorize()` in CredentialsProvider rejects test accounts on password login, so they cannot acquire a session at all via credentials |
| Client (defense-in-depth) | Admin dashboard server component checks `session.user.isImpersonating` — hides "Log in as" buttons when already impersonating |

The client layer is cosmetic only; all actual enforcement is server-side.

---

## 3. Google OAuth for admin login

### Relationship to existing Gmail OAuth

| Surface | Location | Credentials | Scopes | Purpose |
|---|---|---|---|---|
| **Gmail OAuth (existing)** | `/api/auth/gmail/connect` → `/api/auth/gmail/callback` → `OAuthEmailConnection` table | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (already in `env.ts`) | `gmail.send` + `userinfo.email` | Tutor sends parent emails FROM their connected Gmail account |
| **Admin-login OAuth (new)** | NextAuth `GoogleProvider` at `/api/auth/callback/google` | Same `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — **no new credentials needed** | `openid email profile` | Andrew authenticates TO the app as admin |

These are the **same Google OAuth app** (same client ID / secret, shared consent screen) but serve completely different purposes. The existing Gmail OAuth is a custom manual flow — it is NOT a NextAuth provider and stores `refresh_token` in `OAuthEmailConnection`. The new GoogleProvider is purely for NextAuth session creation; it does NOT touch `OAuthEmailConnection`.

> **Google Cloud Console action required (pre-deploy):** Add `https://<production-domain>/api/auth/callback/google` to the OAuth app's authorized redirect URIs. Optionally add `http://localhost:<devport>/api/auth/callback/google` for local testing. The existing `/api/auth/gmail/callback` redirect URI stays unchanged — both coexist.

### NextAuth GoogleProvider wiring

```ts
// src/auth-options.ts
import GoogleProvider from "next-auth/providers/google";

providers: [
  CredentialsProvider({ ... }), // unchanged

  GoogleProvider({
    clientId: env.GOOGLE_CLIENT_ID!,
    clientSecret: env.GOOGLE_CLIENT_SECRET!,
    authorization: {
      params: { scope: "openid email profile" }, // NOT gmail.send
    },
  }),
],
```

**`signIn` callback — Google email guard (BLOCKER):**

```ts
async signIn({ user, account }) {
  if (account?.provider === "google") {
    if (!user.email) return false;
    const admin = await getAdminByEmail(user.email);
    if (!admin) return "/login?error=not_authorized";         // No DB row
    if (admin.isTestAccount) return "/login?error=not_authorized"; // Test accounts cannot OAuth
    return true;
  }
  return true; // CredentialsProvider handled in authorize()
},
```

**`env.ts` update (Dispatch A):**

Make `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` required (not just optional) for production builds; keep optional for local dev without Google OAuth. Guard at runtime:

```ts
// In GoogleProvider config — runtime guard:
if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
  // Skip GoogleProvider in development if not configured
  // (CredentialsProvider still available as fallback)
}
```

The executor should use a conditional `providers` array or an empty stub GoogleProvider to keep TypeScript happy when credentials are absent.

### Migration for `arangarx+test1@gmail.com`

**Sequential steps (to be documented in Dispatch A bootstrapper):**

1. **Before Dispatch A merges:** Andrew identifies his real admin Google email (e.g., `arangarx@gmail.com`).
2. **Dispatch A ships schema migration.** `isTestAccount` column added; `passwordHash` made nullable.
3. **Executor provides a seed SQL script** (run once against Neon production by Andrew):

```sql
-- Ensure Andrew's real admin row exists (Google-OAuth-only, no password)
INSERT INTO "AdminUser" (id, email, "passwordHash", "isTestAccount", "displayName", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'arangarx@gmail.com', NULL, false, 'Andrew', NOW(), NOW())
ON CONFLICT (email) DO UPDATE
  SET "isTestAccount" = false, "passwordHash" = NULL, "updatedAt" = NOW();

-- Mark the test account row
UPDATE "AdminUser"
SET "isTestAccount" = true, "passwordHash" = NULL, "updatedAt" = NOW()
WHERE email = 'arangarx+test1@gmail.com';
```

4. **After Dispatch B ships and smoke passes:** Andrew logs in via Google OAuth as `arangarx@gmail.com`, verifies banner/impersonation flow, confirms `arangarx+test1@gmail.com` password login is rejected.

### Env-only path relationship

The `env.ADMIN_EMAIL / env.ADMIN_PASSWORD` fallback in `student-scope.ts` continues to exist after SEC-1. It is a **legacy bootstrap mechanism** — useful if Andrew ever needs to recover access without a DB row. It is NOT deprecated in this wave; a startup warning if both the env vars and a DB row exist for the same email is a nice follow-up.

---

## 4. Audit logging — `ImpersonationLog`

### Schema (additive — Dispatch A)

```prisma
model ImpersonationLog {
  id                  String    @id @default(uuid())
  adminUserId         String
  adminUser           AdminUser @relation("AdminImpersonations", fields: [adminUserId], references: [id], onDelete: Cascade)
  impersonatedUserId  String
  impersonatedUser    AdminUser @relation("ImpersonatedBy", fields: [impersonatedUserId], references: [id], onDelete: Cascade)
  startedAt           DateTime  @default(now())
  endedAt             DateTime?          // null = session still active or orphaned (token expired without explicit exit)
  vercelDeploymentUrl String?            // process.env.VERCEL_URL at action time; null = local dev

  @@index([adminUserId, startedAt])
  @@index([impersonatedUserId])
}
```

`AdminUser` model additions:

```prisma
model AdminUser {
  // ... existing fields ...
  initiatedImpersonations ImpersonationLog[] @relation("AdminImpersonations")
  wasImpersonatedIn       ImpersonationLog[] @relation("ImpersonatedBy")
}
```

### Log prefix

**`imp`** — register in `AGENTS.md` § Conventions (alongside `rid`, `wbsid`, `obx`, etc.) and in the `ImpersonationLog` section of `src/lib/impersonation.ts` as a file-header comment.

Key log lines:
```
[imp] imp=<logId> admin=<adminId> impersonating=<targetId> start
[imp] imp=<logId> exit admin=<adminId>
[imp] imp=<logId> exit-log-update-failed (swallowed)   ← guard against race on orphan cleanup
```

---

## 5. Banner UX

**Trigger:** `session.user.isImpersonating === true`.

**Placement:** Top of every `/admin/**` page, rendered in the admin root layout (`src/app/admin/layout.tsx` or equivalent). Must be above main content, below navigation.

**Copy:** `"You are signed in as <email> (test account). [Exit impersonation]"`

**Design constraints:**
- Full UI redesign is imminent — keep this **minimal**. A `<div>` with inline Tailwind utility classes (amber/yellow background, dark text, padding). No custom component library tokens, no elaborate animation.
- **NOT dismissible.** The banner must persist until "Exit impersonation" is clicked. A test account in production must always know they're being impersonated.
- Does NOT appear on non-admin pages (share links, `/w/[joinToken]`, public routes).
- The "Exit impersonation" element is a form/button that invokes `exitImpersonation()` server action.

**Sample markup (minimal):**

```tsx
// src/components/ImpersonationBanner.tsx
"use client";
import { exitImpersonation } from "@/app/admin/actions/impersonate";

export function ImpersonationBanner({ email }: { email: string }) {
  return (
    <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-sm text-amber-900 flex items-center justify-between">
      <span>You are signed in as <strong>{email}</strong> (test account).</span>
      <form action={exitImpersonation}>
        <button type="submit" className="ml-4 underline hover:no-underline">
          Exit impersonation
        </button>
      </form>
    </div>
  );
}
```

---

## 6. Admin dashboard UI

### Target location

Discover the existing admin page structure in **Dispatch C** before touching anything. The executor must read `src/app/admin/` before editing. Add a "Test accounts" section to the existing admin home or settings page — do NOT create a new top-level page if one already serves this role.

### v1 scope

- List all `AdminUser` rows where `isTestAccount = true`.
- Per row: email, `createdAt`, "Log in as" button.
- "Log in as" button calls `startImpersonation(targetUserId)` server action.
- On success: redirect to `/admin` (banner now visible).
- **Hide "Log in as" buttons when `session.user.isImpersonating` is true** (already impersonating).

### Server action (`src/app/admin/actions/impersonate.ts` — Dispatch B)

```ts
"use server";
export async function startImpersonation(targetUserId: string): Promise<void> {
  const admin = await assertIsRealAdmin(); // throws ImpersonationForbiddenError if not real admin

  const target = await db.adminUser.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, isTestAccount: true },
  });
  if (!target?.isTestAccount) {
    throw new Error("Can only impersonate test accounts.");
  }

  const logRow = await db.impersonationLog.create({
    data: {
      adminUserId: admin.adminId,
      impersonatedUserId: target.id,
      startedAt: new Date(),
      vercelDeploymentUrl: process.env.VERCEL_URL ?? null,
    },
  });

  console.log(`[imp] imp=${logRow.id} admin=${admin.adminId} impersonating=${target.id} start`);

  await mintImpersonationSession({
    targetId: target.id,
    targetEmail: target.email,
    originalAdminId: admin.adminId,
    originalAdminEmail: admin.email,
    impersonationLogId: logRow.id,
  });

  redirect("/admin");
}
```

### Nice-to-have (defer to v2)

- Create test account form in the UI (v1 uses SQL seed script).
- List of active impersonation sessions (rows where `endedAt IS NULL`).

---

## 7. Five-axis adversarial review

### Axis 1 — Auth boundary + privilege

| Risk | Severity | Mitigation |
|---|---|---|
| Test account calls `startImpersonation()` | **BLOCKER** | `assertIsRealAdmin()` checks `admin.isTestAccount` at the mutation boundary — throws before any write or cookie change |
| Google OAuth open to arbitrary Google accounts | **BLOCKER** | `signIn` callback rejects emails not in DB as `isTestAccount = false`; no auto-provisioning |
| Test account logs in with password | **BLOCKER** | `authorize()` returns null for `isTestAccount = true`; `passwordHash` is physically null (bcrypt never called) |
| `passwordHash = null` causes `bcrypt.compare` throw | **BLOCKER** | `verifyPassword(plain, null)` must return `false` not throw — early null-check before bcrypt call |
| `originalAdminId` in JWT grants extra privilege | Low | All authz calls use `session.user.id` (test account during impersonation); `originalAdminId` is not checked by any authz function |

### Axis 2 — Session integrity

| Risk | Severity | Mitigation |
|---|---|---|
| Session fixation on impersonation start | Low | New token minted with new `iat`; old cookie overwritten |
| Impersonation JWT valid after exit | Low | Exit replaces cookie with admin JWT; old token is not a DB session (JWT-stateless) — it becomes invalid when cookie is overwritten |
| CSRF on exit-impersonation action | Low | Next.js App Router server actions have CSRF protection by default (same-origin header check) |
| Token expiry without exit → orphaned audit row | Acceptable | `endedAt = null` is detectable; no security risk (session already expired); see Open Question Q3 |

### Axis 3 — Race conditions

| Risk | Severity | Mitigation |
|---|---|---|
| Double-click "Log in as" creates two `ImpersonationLog` rows | Low | Second action finds cookie already replaced with impersonation JWT; `assertIsRealAdmin()` checks `isTestAccount` and would find the current caller is a test account — second action thrown; `startImpersonation` should also be idempotent-guarded (see executor note) |
| Two browser tabs: start impersonation in tab A while tab B still has admin cookie | Low | Last-write-wins on cookie name; tab B's next server action with stale cookie gets wrong-session error or redirect to `/login` |
| Impersonation start races with `exitImpersonation` from another tab | Low | Both write to the same cookie name; final writer wins; `ImpersonationLog` endedAt may be set on the wrong row — acceptable at solo-tutor pilot scale |

### Axis 4 — Cross-platform

| Platform | Risk | Mitigation |
|---|---|---|
| Mobile Safari — cookie SameSite | Low | `sameSite: "lax"` is correct for same-site navigation (server action POST is same-site) |
| Vercel preview subdomains — per-subdomain cookie scope | Low | NextAuth default cookie is per-hostname; impersonation cookies are per-preview (correct — each preview is isolated) |
| Chrome's "save password" prompt for test account | Resolved | Test accounts have no password login path → Chrome never sees a successful password credential → no save-password prompt |

### Axis 5 — Observability

| Prefix | Surface | Key transitions |
|---|---|---|
| `imp` (new) | Impersonation lifecycle | `start`, `exit`, swallowed log failures |
| (inherits all existing prefixes) | Actions during impersonation | All existing `rid`, `wbsid`, `obx`, etc. log normally; the visual banner makes the admin-as-test-user state human-observable |

---

## 8. BLOCKERs — Phase-1 acceptance criteria

Must be verified before each dispatch's branch is declared smoke-ready.

### Dispatch A

1. **`isTestAccount` blocks credentials login** — test: `authorize({ email: testEmail, password: anything })` returns `null`. Red-before / green-after in `src/__tests__/auth.test.ts`.
2. **`verifyPassword(plain, null)` returns false** — unit test: does not throw; returns `false`. In `src/__tests__/auth.test.ts` or `auth-db.test.ts`.
3. **Google `signIn` callback rejects unknown email** — unit test: `signIn({ user: { email: "stranger@gmail.com" }, account: { provider: "google" } })` returns a non-`true` value.
4. **Google `signIn` callback rejects test account email** — unit test: `signIn` for a `isTestAccount = true` email returns non-`true`.
5. **Migration is additive** — inspect generated SQL: `ALTER COLUMN "passwordHash" DROP NOT NULL`; no `DROP COLUMN`; `isTestAccount` has `DEFAULT false`; `ImpersonationLog` table created fresh.
6. **`assertIsRealAdmin()` throws for test account session** — unit test with a mocked session where `isTestAccount = true` → `ImpersonationForbiddenError` thrown.
7. **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` missing = GoogleProvider skipped gracefully** — `npx tsc --noEmit` green with env vars absent.

### Dispatch B

8. **Banner present when impersonating** — smoke: visit `/admin` as impersonated session → banner shows `<testEmail>`.
9. **Exit restores admin session** — smoke: click "Exit" → redirect to `/admin` → real admin email shown, no banner → DB row has `endedAt` populated.
10. **`startImpersonation()` called as test account → Forbidden** — integration test with mocked test-account session.
11. **Password login rejected for `arangarx+test1@gmail.com`** — smoke: credentials login attempt → `/login` error.

### Dispatch C

12. **"Log in as" not shown when `isImpersonating = true`** — render test: component receives `isImpersonating: true` session → button absent.
13. **Test account list shows only `isTestAccount = true` rows** — render test: mock DB returns mixed rows; only test accounts rendered.

---

## 9. Open questions Andrew must ratify

> **Status (Andrew 2026-05-30): orchestrator-discretion delegated.** Andrew is
> not answering the 6 Qs individually — trusts the orchestrator to use the
> recommended defaults below until tests fail or a specific blocking question
> surfaces. **Do not mark Qs individually answered**; escalate to Andrew only on
> test failures or a blocking Q.

### Q1 — Real admin: Google-OAuth-only or password-also-allowed?

After SEC-1, should Andrew's real `arangarx@gmail.com` row have `passwordHash = null` (Google-OAuth-only) or also allow a password?

- **(A — recommended):** `passwordHash = null`. Only path in is Google OAuth. Inherits Google 2FA, simpler surface.
- **(B):** Row has a strong random password set. Both paths work. More redundancy, more surface.

**Default if no answer:** A.

---

### Q2 — Impersonation session timeout: same as normal or shorter?

- **(A — default):** Same 8-hour max-age as normal NextAuth session.
- **(B):** Shorter, e.g., 2 hours. Reduces orphaned-row risk; minor friction if Andrew does a long test smoke session.

**Default if no answer:** A (8 hours).

---

### Q3 — Orphaned `ImpersonationLog` rows (token expired without exit)

When a token expires mid-impersonation, `endedAt` stays `null`. At solo-tutor scale this is noise, not risk. Options:

- **(A — recommended):** Accept null rows. Note them in the admin dashboard as "(X sessions — may include expired without explicit exit)."
- **(B):** On next real admin Google OAuth login, the `signIn` callback scans for open rows where `adminUserId = <thisAdmin>` and stamps `endedAt = now()`.
- **(C):** No action — pilot scale, single-user, ignore entirely.

**Default if no answer:** A.

---

### Q4 — Google Cloud Console redirect URI: add localhost?

The production redirect URI must be added before Dispatch A can smoke in Vercel. Question is whether to also add `http://localhost:<devport>/api/auth/callback/google` for local Google OAuth testing.

- **(A — recommended):** Add both. Full local testability; executor can validate Google OAuth flow locally.
- **(B):** Add production only. Local dev uses CredentialsProvider as before; Google OAuth tested only on Vercel preview.

**Andrew action required regardless of choice:** Add at least the production URI to Google Cloud Console before Dispatch A deploys.

**Default if no answer:** A.

---

### Q5 — Real admin row creation: SQL seed or auto-provisioning?

The seed SQL in § 3 above creates Andrew's real admin row. Options:

- **(A — recommended):** Executor ships the seed SQL script in `scripts/seed-admin-google.sql` (gitignored); Andrew runs it once against Neon production. Simple and auditable.
- **(B):** Server action Andrew triggers once after deploy (e.g., `/admin/setup-google-admin`).
- **(C):** Auto-provisioning on first Google login — **not recommended** (see threat model: paradoxical without a prior allowlist).

**Default if no answer:** A.

---

### Q6 — `startImpersonation()` idempotency on double-click

The current design allows a second click to hit `startImpersonation()` before the first redirect fires. The second invocation finds `assertIsRealAdmin()` passing (the session cookie hasn't changed yet for the second call). This could create a second `ImpersonationLog` row. Options:

- **(A — recommended):** Executor adds a guard: check for an existing open `ImpersonationLog` row (`endedAt IS NULL`) for this `(adminUserId, impersonatedUserId)` pair and return early if one exists.
- **(B):** Accept the double-row at solo-tutor pilot scale — no security risk, minor audit noise.

**Default if no answer:** A.

---

## Appendix: code findings that deviate from BACKLOG assumptions

| BACKLOG assumption | Actual code finding | Design adjustment |
|---|---|---|
| "Null the password hash" (implied nullable) | `passwordHash String` is currently **non-nullable** in `prisma/schema.prisma` | Dispatch A migration must include `ALTER COLUMN "passwordHash" DROP NOT NULL` — this is the primary schema prerequisite |
| "Existing Gmail OAuth infra" implies shared NextAuth provider | Gmail OAuth is a **custom manual flow** (`/api/auth/gmail/connect`, `OAuthEmailConnection`) — NOT a NextAuth provider | Admin-login GoogleProvider is a new, separate NextAuth provider; no conflict with Gmail OAuth; both coexist using the same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` but different redirect URIs |
| `assertOwnsStudent` is the auth mutation pattern | Confirmed: `requireStudentScope()` → DB ownership check → `notFound()` on miss | `assertIsRealAdmin()` mirrors this exactly: `requireStudentScope()` → DB `isTestAccount` check → `ImpersonationForbiddenError` on violation |
| `getStudentScope()` will need changes during impersonation | `getStudentScope()` resolves by session email → DB lookup — works transparently: impersonation session email = test account email → scope = test account's adminId | **No changes needed to `student-scope.ts` or `whiteboard-scope.ts`** — impersonation is transparent to all existing scope/ownership logic |
| Admin dashboard exists at a known path | Not confirmed from code | **Dispatch C must discover** `src/app/admin/` structure before editing; do not assume a path |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are new env vars | Both are **already defined** in `src/lib/env.ts` (lines 23–24, 79–80) as optional — used by Gmail OAuth | No new env vars needed; make both required in Dispatch A's schema validation for production builds |
