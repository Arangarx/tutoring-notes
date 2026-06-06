import Link from "next/link";
import { assertIsAdmin } from "@/lib/impersonation";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import {
  daysSinceRateCardVerified,
  isRateCardStale,
  RATE_CARD_VERSION,
  RATE_CARD_VERIFIED_AT,
  WHISPER_1_USD_PER_AUDIO_MINUTE,
} from "@/lib/observability/rate-card";
import {
  formatUsd,
  getCostBySource,
  getCostByTutor,
  getCostDashboardSummary,
  getMonthlyCostBars,
  PRICING_FLOOR_60MIN_USD,
} from "@/lib/observability/cost-queries";

export const dynamic = "force-dynamic";

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub ? (
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

export default async function AdminCostPage() {
  await assertIsAdmin();

  const stale = isRateCardStale();
  const daysSince = daysSinceRateCardVerified();
  const verifiedLabel = RATE_CARD_VERIFIED_AT.toISOString().slice(0, 10);

  const [summary, bySource, byTutor, monthlyBars] = await Promise.all([
    getCostDashboardSummary(),
    getCostBySource(),
    getCostByTutor(),
    getMonthlyCostBars(6),
  ]);

  const maxBarUsd = Math.max(...monthlyBars.map((b) => b.totalUsd), 0.001);

  return (
    <AdminPageShell
      title="Cost observability"
      description={
        <>
          Estimated per-session and platform costs for pricing validation. Figures are{" "}
          <strong>estimates</strong> from API usage data × the verified rate-card — not exact
          provider invoices.
        </>
      }
    >
      {stale ? (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: "12px 14px",
            background: "var(--warning-soft)",
            border: "1px solid var(--warning-border)",
            fontSize: 13,
          }}
        >
          Rate card last verified {verifiedLabel} ({daysSince} days ago) — review{" "}
          <a
            href="https://developers.openai.com/api/docs/pricing"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenAI
          </a>
          ,{" "}
          <a href="https://vercel.com/pricing" target="_blank" rel="noopener noreferrer">
            Vercel
          </a>
          , and{" "}
          <a href="https://neon.com/pricing" target="_blank" rel="noopener noreferrer">
            Neon
          </a>{" "}
          pricing and update{" "}
          <code className="text-xs">src/lib/observability/rate-card.ts</code>.
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
          Rate card {RATE_CARD_VERSION} · verified {verifiedLabel} ({daysSince} days ago)
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <SummaryCard
          label="This month (estimated)"
          value={formatUsd(summary.monthTotalUsd)}
        />
        <SummaryCard
          label="Avg / session (30d)"
          value={formatUsd(summary.avgCostPerSessionUsd)}
          sub={`${summary.sessionsLast30Days} sessions`}
        />
        <SummaryCard
          label="Sessions this month"
          value={String(summary.monthSessionCount)}
        />
        <SummaryCard
          label="Pricing floor (60 min)"
          value={formatUsd(PRICING_FLOOR_60MIN_USD)}
          sub={`Whisper @ $${WHISPER_1_USD_PER_AUDIO_MINUTE}/min dominates`}
        />
      </div>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>By cost source (this month)</h2>
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr className="muted">
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Source</th>
                <th style={{ textAlign: "left", padding: "8px 12px" }}>Usage</th>
                <th style={{ textAlign: "right", padding: "8px 12px" }}>Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {bySource.map((row) => (
                <tr key={row.kindGroup}>
                  <td style={{ padding: "8px 12px" }}>{row.label}</td>
                  <td className="muted" style={{ padding: "8px 12px" }}>
                    {row.detail}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right" }}>
                    {formatUsd(row.totalUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>By tutor (this month)</h2>
        {byTutor.length === 0 ? (
          <p className="muted">No cost events with tutor attribution yet.</p>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr className="muted">
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Tutor</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Sessions</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Whisper min</th>
                  <th style={{ textAlign: "right", padding: "8px 12px" }}>Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {byTutor.map((row) => (
                  <tr key={row.adminUserId}>
                    <td style={{ padding: "8px 12px" }}>{row.tutorName}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      {row.sessionCount}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      {row.whisperMinutes.toFixed(1)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      {formatUsd(row.totalUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Monthly trend (6 months)</h2>
        <div className="card" style={{ padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, minHeight: 120 }}>
            {monthlyBars.map((bar) => (
              <div
                key={bar.month}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <div
                  title={formatUsd(bar.totalUsd)}
                  style={{
                    width: "100%",
                    maxWidth: 48,
                    height: `${Math.max(4, (bar.totalUsd / maxBarUsd) * 100)}px`,
                    background: "var(--accent)",
                    borderRadius: 4,
                  }}
                />
                <span className="muted" style={{ fontSize: 10, textAlign: "center" }}>
                  {bar.month}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: "14px 16px", fontSize: 13 }}>
        <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>Pricing-floor reference</h2>
        <p className="muted" style={{ margin: "0 0 8px" }}>
          60-minute whiteboard session variable cost anchor (design doc §1.3): Whisper ~$0.36,
          GPT + blob + compute rounding errors. Use per-session drill-down on{" "}
          <Link href="/admin/students">student whiteboard review</Link> pages to validate against
          real sessions.
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>
          Tutor-facing cost UI is deferred until the pricing model is locked (session tokens).
        </p>
      </section>
    </AdminPageShell>
  );
}
