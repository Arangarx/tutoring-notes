/**
 * SEC-1 Dispatch C — Test accounts list + "Log in as" on the real-admin dashboard.
 */

import { db } from "@/lib/db";
import { assertIsRealAdmin } from "@/lib/impersonation";
import { startImpersonation } from "@/app/admin/actions/impersonate";

export async function AdminTestAccountsPanel() {
  await assertIsRealAdmin();

  const testAccounts = await db.adminUser.findMany({
    where: { isTestAccount: true },
    select: { id: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <section aria-labelledby="test-accounts-heading">
      <h2 id="test-accounts-heading" style={{ marginTop: 0 }}>
        Test accounts
      </h2>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        Open the tutor workspace as a test account. Your admin session stays signed in
        behind the scenes — use Exit impersonation to return here.
      </p>

      {testAccounts.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No test accounts yet. Seed <code>isTestAccount=true</code> rows in the database.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
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
                  Created {acct.createdAt.toLocaleDateString()}
                </div>
              </div>
              <form action={startImpersonation.bind(null, acct.id)}>
                <button type="submit" className="btn primary" style={{ fontSize: 13 }}>
                  Log in as
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
