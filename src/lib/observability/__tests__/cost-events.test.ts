/**
 * Unit tests for cost-event logging + pricing helper.
 */

jest.mock("@/lib/db", () => ({
  db: {
    costEvent: {
      create: jest.fn(),
    },
  },
}));

import { db } from "@/lib/db";
import {
  estimateCostUsd,
  estimateVercelComputeGbHr,
  logBlobEgressEvent,
  logCostEvent,
} from "@/lib/observability/cost-events";
import { RATE_CARD_VERSION } from "@/lib/observability/rate-card";

const mockCostEventCreate = db.costEvent.create as jest.MockedFunction<
  typeof db.costEvent.create
>;

describe("estimateCostUsd", () => {
  test("whisper-1 uses per-minute rate", () => {
    const usd = estimateCostUsd({
      kind: "WHISPER_TRANSCRIPTION",
      model: "whisper-1",
      audioSeconds: 60,
    });
    expect(usd).toBeCloseTo(0.006, 6);
  });

  test("gpt-4o-mini-transcribe uses lower per-minute rate", () => {
    const usd = estimateCostUsd({
      kind: "WHISPER_TRANSCRIPTION",
      model: "gpt-4o-mini-transcribe",
      audioSeconds: 60,
    });
    expect(usd).toBeCloseTo(0.003, 6);
  });

  test("gpt-4o-mini combines input + output token rates", () => {
    const usd = estimateCostUsd({
      kind: "GPT_NOTES_GENERATION",
      model: "gpt-4o-mini",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(0.15 + 0.6, 6);
  });

  test("BLOB_EGRESS uses bytes × egress rate", () => {
    const oneGbBytes = 1_000_000_000;
    const usd = estimateCostUsd({
      kind: "BLOB_EGRESS",
      model: "vercel-blob",
      bytesTransferred: oneGbBytes,
    });
    expect(usd).toBeCloseTo(0.05, 6);
  });

  test("BLOB_STORAGE uses gbMonths × storage rate", () => {
    const usd = estimateCostUsd({
      kind: "BLOB_STORAGE",
      model: "vercel-blob",
      gbMonths: 1,
    });
    expect(usd).toBeCloseTo(0.023, 6);
  });

  test("VERCEL_COMPUTE uses computeGbHr × memory rate", () => {
    const usd = estimateCostUsd({
      kind: "VERCEL_COMPUTE",
      model: "vercel-serverless",
      computeGbHr: 0.5,
    });
    expect(usd).toBeCloseTo(0.0106, 4);
  });

  test("NEON_COMPUTE uses computeGbHr × CU rate", () => {
    const usd = estimateCostUsd({
      kind: "NEON_COMPUTE",
      model: "neon-launch",
      computeGbHr: 1,
    });
    expect(usd).toBeCloseTo(0.106, 6);
  });

  test("GPT kind accepts snapshot model ids containing gpt-4o-mini", () => {
    const usd = estimateCostUsd({
      kind: "GPT_NOTES_GENERATION",
      model: "gpt-4o-mini-2024-07-18",
      inputTokens: 10_000,
      outputTokens: 500,
    });
    expect(usd).not.toBeUndefined();
    expect(usd!).toBeGreaterThanOrEqual(0);
  });

  test("unknown whisper model returns undefined", () => {
    expect(
      estimateCostUsd({
        kind: "WHISPER_TRANSCRIPTION",
        model: "gpt-4o-mini",
        audioSeconds: 60,
      })
    ).toBeUndefined();
  });

  test("unknown chat model returns undefined", () => {
    expect(
      estimateCostUsd({
        kind: "GPT_NOTES_GENERATION",
        model: "gpt-5-fake",
        inputTokens: 100,
        outputTokens: 50,
      })
    ).toBeUndefined();
  });

  test("missing token counts returns undefined for GPT", () => {
    expect(
      estimateCostUsd({
        kind: "GPT_NOTES_GENERATION",
        model: "gpt-4o-mini",
        inputTokens: 100,
      })
    ).toBeUndefined();
  });
});

describe("estimateVercelComputeGbHr", () => {
  test("90s at 512MB (0.5 GB) yields expected GB-hr", () => {
    expect(estimateVercelComputeGbHr(90_000, 0.5)).toBeCloseTo(0.0125, 4);
  });
});

describe("logCostEvent", () => {
  beforeEach(() => {
    mockCostEventCreate.mockReset();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("happy path writes expected Prisma payload with rateCardVersion default", async () => {
    mockCostEventCreate.mockResolvedValueOnce({ id: "cev-row-1" } as never);

    await logCostEvent({
      kind: "GPT_NOTES_GENERATION",
      model: "gpt-4o-mini",
      inputTokens: 10,
      outputTokens: 20,
      estimatedCostUsd: 0.000001,
      adminUserId: "admin-1",
      studentId: "stu-1",
    });

    expect(mockCostEventCreate).toHaveBeenCalledTimes(1);
    const arg = mockCostEventCreate.mock.calls[0][0];
    expect(arg.data.kind).toBe("GPT_NOTES_GENERATION");
    expect(arg.data.model).toBe("gpt-4o-mini");
    expect(arg.data.inputTokens).toBe(10);
    expect(arg.data.outputTokens).toBe(20);
    expect(Number(arg.data.estimatedCostUsd)).toBeCloseTo(0.000001, 8);
    expect(arg.data.adminUserId).toBe("admin-1");
    expect(arg.data.studentId).toBe("stu-1");
    expect(arg.data.rateCardVersion).toBe(RATE_CARD_VERSION);
  });

  test("auto-computes estimatedCostUsd when omitted", async () => {
    mockCostEventCreate.mockResolvedValueOnce({ id: "cev-row-2" } as never);

    await logCostEvent({
      kind: "WHISPER_TRANSCRIPTION",
      model: "whisper-1",
      audioSeconds: 60,
    });

    const arg = mockCostEventCreate.mock.calls[0][0];
    expect(Number(arg.data.estimatedCostUsd)).toBeCloseTo(0.006, 6);
  });

  test("does not throw when Prisma rejects", async () => {
    mockCostEventCreate.mockRejectedValueOnce(new Error("db unavailable"));

    await expect(
      logCostEvent({
        kind: "WHISPER_TRANSCRIPTION",
        model: "whisper-1",
        audioSeconds: 5,
      })
    ).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalled();
  });
});

describe("logBlobEgressEvent", () => {
  beforeEach(() => {
    mockCostEventCreate.mockReset();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("writes BLOB_EGRESS with bytes and provenance", async () => {
    mockCostEventCreate.mockResolvedValueOnce({ id: "cev-egress-1" } as never);

    await logBlobEgressEvent({
      bytesTransferred: 28_000_000,
      sessionRecordingId: "rec-1",
      adminUserId: "admin-1",
      whiteboardSessionId: "wbs-1",
    });

    const arg = mockCostEventCreate.mock.calls[0][0];
    expect(arg.data.kind).toBe("BLOB_EGRESS");
    expect(arg.data.bytesTransferred).toBe(28_000_000);
    expect(arg.data.sessionRecordingId).toBe("rec-1");
    expect(Number(arg.data.estimatedCostUsd)).toBeGreaterThan(0);
  });
});
