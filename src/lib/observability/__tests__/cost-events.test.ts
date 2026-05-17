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
import { logCostEvent, estimateCostUsd } from "@/lib/observability/cost-events";

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

  test("gpt-4o-mini combines input + output token rates", () => {
    const usd = estimateCostUsd({
      kind: "GPT_NOTES_GENERATION",
      model: "gpt-4o-mini",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(0.15 + 0.6, 6);
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

describe("logCostEvent", () => {
  beforeEach(() => {
    mockCostEventCreate.mockReset();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("happy path writes expected Prisma payload", async () => {
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
