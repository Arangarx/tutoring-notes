/**
 * SEC-1 Dispatch B — INTERIM B TRIGGER.
 *
 * Minimal test-account list for smoke-testing the impersonation flow.
 * Dispatch C will replace this with the polished admin dashboard section.
 * Do NOT build on this component — it is intentionally unstyled/minimal.
 */

import { db } from "@/lib/db";
import { startImpersonation } from "@/app/admin/actions/impersonate";

interface Props {
  /** Pass session.user.isImpersonating — hides "Log in as" during an active session */
  isImpersonating: boolean;
}

export async function TestAccountsSection({ isImpersonating }: Props) {
  const testAccounts = await db.adminUser.findMany({
    where: { isTestAccount: true },
    select: { id: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  if (testAccounts.length === 0) return null;

  return (
    <div>
      <div className="divider" />
      <h3 style={{ marginTop: 0 }}>
        Test accounts{" "}
        <span
          className="muted"
          style={{ fontSize: 11, fontWeight: 400 }}
          title="Interim B trigger — Dispatch C replaces this with the polished section"
        >
          (interim)
        </span>
      </h3>

      {isImpersonating ? (
        <p className="muted" style={{ fontSize: 13 }}>
          Exit impersonation before starting a new session.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {testAccounts.map((acct) => (
            <div
              key={acct.id}
              className="card"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{acct.email}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  isTestAccount · created {acct.createdAt.toLocaleDateString()}
                </div>
              </div>
              {/* startImpersonation.bind pre-fills targetUserId for the form action */}
              <form action={startImpersonation.bind(null, acct.id)}>
                <button type="submit" className="btn" style={{ fontSize: 13 }}>
                  Log in as
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
