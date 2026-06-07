/**
 * Server-side aggregations for the admin /admin/cost dashboard.
 * DB-backed — validated by orchestrator after migration apply.
 */

import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/auth-options";

const WHISPER_KINDS = ["WHISPER_TRANSCRIPTION"] as const;
const GPT_KINDS = [
  "GPT_NOTES_GENERATION",
  "GPT_ASSESSMENT_EXTRACTION",
] as const;
const BLOB_KINDS = ["BLOB_STORAGE", "BLOB_EGRESS"] as const;
const COMPUTE_KINDS = ["VERCEL_COMPUTE", "NEON_COMPUTE"] as const;

export type CostSourceRow = {
  label: string;
  kindGroup: string;
  totalUsd: number;
  detail: string;
};

export type CostByTutorRow = {
  adminUserId: string;
  tutorName: string;
  sessionCount: number;
  whisperMinutes: number;
  totalUsd: number;
};

export type CostDashboardSummary = {
  monthTotalUsd: number;
  avgCostPerSessionUsd: number;
  sessionsLast30Days: number;
  monthSessionCount: number;
};

export type MonthlyCostBar = {
  month: string;
  totalUsd: number;
};

export type SessionCostBreakdown = {
  whisperMinutes: number;
  whisperUsd: number;
  gptInputTokens: number;
  gptOutputTokens: number;
  gptUsd: number;
  blobEgressBytes: number;
  blobEgressUsd: number;
  blobStorageUsd: number;
  computeUsd: number;
  totalUsd: number;
  events: Array<{
    id: string;
    kind: string;
    model: string;
    estimatedCostUsd: number | null;
    createdAt: Date;
  }>;
};

function monthStart(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  if (value == null) return 0;
  return Number(value);
}

async function sumCostUsd(where: Prisma.CostEventWhereInput): Promise<number> {
  const agg = await db.costEvent.aggregate({
    where,
    _sum: { estimatedCostUsd: true },
  });
  return decimalToNumber(agg._sum.estimatedCostUsd);
}

export async function getCostDashboardSummary(): Promise<CostDashboardSummary> {
  const startOfMonth = monthStart();
  const thirtyDaysAgo = daysAgo(30);

  const [monthTotalUsd, sessionsLast30Days, monthSessionCount] = await Promise.all([
    sumCostUsd({ createdAt: { gte: startOfMonth } }),
    db.whiteboardSession.count({
      where: { endedAt: { not: null }, startedAt: { gte: thirtyDaysAgo } },
    }),
    db.whiteboardSession.count({
      where: { endedAt: { not: null }, startedAt: { gte: startOfMonth } },
    }),
  ]);

  const avgCostPerSessionUsd =
    sessionsLast30Days > 0
      ? await sumCostUsd({ createdAt: { gte: thirtyDaysAgo } }) / sessionsLast30Days
      : 0;

  return {
    monthTotalUsd,
    avgCostPerSessionUsd,
    sessionsLast30Days,
    monthSessionCount,
  };
}

export async function getCostBySource(monthStartDate: Date = monthStart()): Promise<CostSourceRow[]> {
  const events = await db.costEvent.findMany({
    where: { createdAt: { gte: monthStartDate } },
    select: {
      kind: true,
      estimatedCostUsd: true,
      audioSeconds: true,
      inputTokens: true,
      outputTokens: true,
      bytesTransferred: true,
      gbMonths: true,
      computeGbHr: true,
    },
  });

  type Acc = {
    totalUsd: number;
    whisperSec: number;
    gptIn: number;
    gptOut: number;
    blobBytes: number;
    blobGbMonths: number;
    computeGbHr: number;
  };

  const acc: Record<string, Acc> = {
    whisper: { totalUsd: 0, whisperSec: 0, gptIn: 0, gptOut: 0, blobBytes: 0, blobGbMonths: 0, computeGbHr: 0 },
    gpt: { totalUsd: 0, whisperSec: 0, gptIn: 0, gptOut: 0, blobBytes: 0, blobGbMonths: 0, computeGbHr: 0 },
    blob: { totalUsd: 0, whisperSec: 0, gptIn: 0, gptOut: 0, blobBytes: 0, blobGbMonths: 0, computeGbHr: 0 },
    compute: { totalUsd: 0, whisperSec: 0, gptIn: 0, gptOut: 0, blobBytes: 0, blobGbMonths: 0, computeGbHr: 0 },
  };

  for (const e of events) {
    const usd = decimalToNumber(e.estimatedCostUsd);
    if (WHISPER_KINDS.includes(e.kind as (typeof WHISPER_KINDS)[number])) {
      acc.whisper.totalUsd += usd;
      acc.whisper.whisperSec += e.audioSeconds ?? 0;
    } else if (GPT_KINDS.includes(e.kind as (typeof GPT_KINDS)[number])) {
      acc.gpt.totalUsd += usd;
      acc.gpt.gptIn += e.inputTokens ?? 0;
      acc.gpt.gptOut += e.outputTokens ?? 0;
    } else if (BLOB_KINDS.includes(e.kind as (typeof BLOB_KINDS)[number])) {
      acc.blob.totalUsd += usd;
      if (e.kind === "BLOB_EGRESS") acc.blob.blobBytes += e.bytesTransferred ?? 0;
      if (e.kind === "BLOB_STORAGE") acc.blob.blobGbMonths += e.gbMonths ?? 0;
    } else if (COMPUTE_KINDS.includes(e.kind as (typeof COMPUTE_KINDS)[number])) {
      acc.compute.totalUsd += usd;
      acc.compute.computeGbHr += e.computeGbHr ?? 0;
    }
  }

  return [
    {
      label: "OpenAI Whisper",
      kindGroup: "whisper",
      totalUsd: acc.whisper.totalUsd,
      detail: `${(acc.whisper.whisperSec / 60).toFixed(1)} audio-min`,
    },
    {
      label: "OpenAI GPT-4o-mini",
      kindGroup: "gpt",
      totalUsd: acc.gpt.totalUsd,
      detail: `${acc.gpt.gptIn.toLocaleString()} in / ${acc.gpt.gptOut.toLocaleString()} out tok`,
    },
    {
      label: "Vercel Blob (storage + egress)",
      kindGroup: "blob",
      totalUsd: acc.blob.totalUsd,
      detail: `${(acc.blob.blobBytes / 1e9).toFixed(3)} GB egress · ${acc.blob.blobGbMonths.toFixed(4)} GB-mo storage`,
    },
    {
      label: "Vercel / Neon compute",
      kindGroup: "compute",
      totalUsd: acc.compute.totalUsd,
      detail: `${acc.compute.computeGbHr.toFixed(4)} GB-hr / CU-hr`,
    },
  ];
}

export async function getCostByTutor(monthStartDate: Date = monthStart()): Promise<CostByTutorRow[]> {
  const grouped = await db.costEvent.groupBy({
    by: ["adminUserId"],
    where: {
      createdAt: { gte: monthStartDate },
      adminUserId: { not: null },
    },
    _sum: { estimatedCostUsd: true, audioSeconds: true },
    _count: { id: true },
  });

  const adminIds = grouped
    .map((g) => g.adminUserId)
    .filter((id): id is string => id != null);

  const admins =
    adminIds.length > 0
      ? await db.adminUser.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, email: true, displayName: true },
        })
      : [];

  const adminMap = new Map(admins.map((a) => [a.id, a]));

  const sessionCounts = await db.whiteboardSession.groupBy({
    by: ["adminUserId"],
    where: { endedAt: { not: null }, startedAt: { gte: monthStartDate } },
    _count: { id: true },
  });
  const sessionMap = new Map(sessionCounts.map((s) => [s.adminUserId, s._count.id]));

  return grouped
    .filter((g) => g.adminUserId != null)
    .map((g) => {
      const admin = adminMap.get(g.adminUserId!);
      return {
        adminUserId: g.adminUserId!,
        tutorName: admin?.displayName?.trim() || admin?.email || g.adminUserId!,
        sessionCount: sessionMap.get(g.adminUserId!) ?? 0,
        whisperMinutes: (g._sum.audioSeconds ?? 0) / 60,
        totalUsd: decimalToNumber(g._sum.estimatedCostUsd),
      };
    })
    .sort((a, b) => b.totalUsd - a.totalUsd);
}

export async function getMonthlyCostBars(months: number = 6): Promise<MonthlyCostBar[]> {
  const bars: MonthlyCostBar[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const label = d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
    const totalUsd = await sumCostUsd({
      createdAt: { gte: d, lt: next },
    });
    bars.push({ month: label, totalUsd });
  }

  return bars;
}

export async function getSessionCostBreakdown(
  whiteboardSessionId: string
): Promise<SessionCostBreakdown | null> {
  // Fix A — server-side authorization (defense-in-depth; mirrors the page-level showCostPanel gate).
  // Allow: ADMIN role (operator), actively impersonating (admin testing as tutor), isTestAccount=true (QA).
  // Deny: real TUTOR-role accounts (e.g. Sarah) — cost data must not be visible to real tutors
  //       even if the page-level gate is somehow bypassed.
  const session = await getServerSession(authOptions);
  const user = session?.user;
  const authorized =
    user?.role === "ADMIN" ||
    user?.isImpersonating === true ||
    user?.isTestAccount === true;
  if (!authorized) {
    console.log(
      `[cev] getSessionCostBreakdown unauthorized wbsid=${whiteboardSessionId} role=${user?.role ?? "none"}`
    );
    return null;
  }

  const events = await db.costEvent.findMany({
    where: { whiteboardSessionId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      model: true,
      estimatedCostUsd: true,
      createdAt: true,
      audioSeconds: true,
      inputTokens: true,
      outputTokens: true,
      bytesTransferred: true,
      gbMonths: true,
      computeGbHr: true,
    },
  });

  let whisperMinutes = 0;
  let whisperUsd = 0;
  let gptInputTokens = 0;
  let gptOutputTokens = 0;
  let gptUsd = 0;
  let blobEgressBytes = 0;
  let blobEgressUsd = 0;
  let blobStorageUsd = 0;
  let computeUsd = 0;

  for (const e of events) {
    const usd = decimalToNumber(e.estimatedCostUsd);
    if (e.kind === "WHISPER_TRANSCRIPTION") {
      whisperMinutes += (e.audioSeconds ?? 0) / 60;
      whisperUsd += usd;
    } else if (e.kind === "GPT_NOTES_GENERATION" || e.kind === "GPT_ASSESSMENT_EXTRACTION") {
      gptInputTokens += e.inputTokens ?? 0;
      gptOutputTokens += e.outputTokens ?? 0;
      gptUsd += usd;
    } else if (e.kind === "BLOB_EGRESS") {
      blobEgressBytes += e.bytesTransferred ?? 0;
      blobEgressUsd += usd;
    } else if (e.kind === "BLOB_STORAGE") {
      blobStorageUsd += usd;
    } else if (e.kind === "VERCEL_COMPUTE" || e.kind === "NEON_COMPUTE") {
      computeUsd += usd;
    }
  }

  const totalUsd =
    whisperUsd + gptUsd + blobEgressUsd + blobStorageUsd + computeUsd;

  return {
    whisperMinutes,
    whisperUsd,
    gptInputTokens,
    gptOutputTokens,
    gptUsd,
    blobEgressBytes,
    blobEgressUsd,
    blobStorageUsd,
    computeUsd,
    totalUsd,
    events: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      model: e.model,
      estimatedCostUsd:
        e.estimatedCostUsd != null ? decimalToNumber(e.estimatedCostUsd) : null,
      createdAt: e.createdAt,
    })),
  };
}

/** Pricing-floor anchor from design §1.3 — 60-min session variable cost. */
export const PRICING_FLOOR_60MIN_USD = 0.364;

export function formatUsd(amount: number): string {
  if (amount < 0.01 && amount > 0) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}
