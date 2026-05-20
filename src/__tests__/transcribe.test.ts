/**
 * Unit tests for src/lib/transcribe.ts
 * Mocks the OpenAI SDK so no real API calls are made.
 */

import { RateLimitError } from "openai";

const mockTranscriptionsCreate = jest.fn();
jest.mock("openai", () => {
  const actual = jest.requireActual<typeof import("openai")>("openai");
  return {
    ...actual,
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      audio: {
        transcriptions: {
          create: mockTranscriptionsCreate,
        },
      },
    })),
    toFile: jest.fn().mockImplementation(async (buffer: Buffer, filename: string, opts: Record<string, string>) => ({
      buffer,
      name: filename,
      type: opts?.type ?? "audio/webm",
      async arrayBuffer() {
        return Uint8Array.from(buffer).buffer;
      },
    })),
  };
});

jest.mock("@/lib/env", () => ({
  env: { OPENAI_API_KEY: "sk-test-key" },
}));

jest.mock("@/lib/observability/cost-events", () => {
  const actual = jest.requireActual(
    "@/lib/observability/cost-events"
  ) as typeof import("@/lib/observability/cost-events");
  return {
    ...actual,
    logCostEvent: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock("@/lib/transcribe-ffmpeg", () => ({
  splitAudioIntoWhisperParts: jest.fn(),
}));

import { logCostEvent } from "@/lib/observability/cost-events";
import { splitAudioIntoWhisperParts } from "@/lib/transcribe-ffmpeg";
import {
  transcribeAudio,
  TUTORING_WHISPER_PROMPT,
  WHISPER_MAX_BYTES,
} from "@/lib/transcribe";

const mockSplit = splitAudioIntoWhisperParts as jest.MockedFunction<typeof splitAudioIntoWhisperParts>;

const SMALL_BUFFER = Buffer.alloc(1024, 0);

const rateLimitHeaders = new Headers();

describe("transcribeAudio", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSplit.mockImplementation(async (buffer: Buffer, filename: string, mimeType: string) => [
      {
        buffer,
        filename,
        mimeType: mimeType.split(";")[0].trim().toLowerCase(),
      },
    ]);
  });

  test("happy path returns transcript and duration", async () => {
    mockTranscriptionsCreate.mockResolvedValue({
      text: "  Student asked about quadratics.  ",
      duration: 183.5,
    });

    const result = await transcribeAudio(SMALL_BUFFER, "session.webm", "audio/webm");

    expect(result).toEqual({
      transcript: "Student asked about quadratics.",
      durationSeconds: 184,
    });
    expect(mockTranscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "whisper-1",
        response_format: "verbose_json",
        language: "en",
        prompt: TUTORING_WHISPER_PROMPT,
      })
    );
    expect(mockSplit).toHaveBeenCalledWith(SMALL_BUFFER, "session.webm", "audio/webm");
    expect(jest.mocked(logCostEvent)).toHaveBeenCalledTimes(1);
  });

  describe("Whisper biasing (v7 — paired with ai.ts PROMPT_VERSION v7)", () => {
    test("TUTORING_WHISPER_PROMPT names the reactions v7's LLM prompt looks for", () => {
      // These are the same words the LLM prompt explicitly maps to assessment
      // signals (see src/lib/ai.ts buildUserPrompt). If they drift apart,
      // Whisper might still write the word but v7's LLM prompt won't recognise
      // it, or vice-versa. Keeping both lists aligned is a soft contract.
      for (const word of [
        "good job",
        "almost",
        "try again",
        "yes",
        "got it",
        "perfect",
        "exactly",
        "right on",
      ]) {
        expect(TUTORING_WHISPER_PROMPT.toLowerCase()).toContain(word);
      }
    });

    test("passes the bias prompt + language=en on EVERY part of a multi-part split", async () => {
      mockSplit.mockResolvedValueOnce([
        { buffer: Buffer.alloc(8, 0), filename: "p1.webm", mimeType: "audio/webm" },
        { buffer: Buffer.alloc(8, 1), filename: "p2.webm", mimeType: "audio/webm" },
        { buffer: Buffer.alloc(8, 2), filename: "p3.webm", mimeType: "audio/webm" },
      ]);
      mockTranscriptionsCreate.mockResolvedValue({ text: "ok", duration: 1 });

      const bigBuffer = Buffer.alloc(WHISPER_MAX_BYTES + 1, 0);
      await transcribeAudio(bigBuffer, "big.webm", "audio/webm");

      expect(mockTranscriptionsCreate).toHaveBeenCalledTimes(3);
      for (const call of mockTranscriptionsCreate.mock.calls) {
        const opts = call[0] as Record<string, unknown>;
        expect(opts.language).toBe("en");
        expect(opts.prompt).toBe(TUTORING_WHISPER_PROMPT);
      }
    });

    test("bias prompt stays under Whisper's 224-token ceiling (rough char proxy)", () => {
      // Whisper's prompt limit is 224 tokens. ~4 chars per token is the
      // standard rough estimate; cap conservatively at 800 chars to leave
      // headroom for future additions without silently truncating.
      expect(TUTORING_WHISPER_PROMPT.length).toBeLessThan(800);
    });
  });

  test("trims transcript whitespace", async () => {
    mockTranscriptionsCreate.mockResolvedValue({
      text: "\n  Hello world\n",
      duration: 10,
    });

    const result = await transcribeAudio(SMALL_BUFFER, "session.mp4", "audio/mp4");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.transcript).toBe("Hello world");
    }
  });

  test("returns null durationSeconds when duration is absent", async () => {
    mockTranscriptionsCreate.mockResolvedValue({ text: "hello" });

    const result = await transcribeAudio(SMALL_BUFFER, "session.webm", "audio/webm");
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.durationSeconds).toBeNull();
    }
  });

  test("oversized file: splits via ffmpeg helper and concatenates transcripts + durations", async () => {
    mockSplit.mockResolvedValueOnce([
      { buffer: Buffer.alloc(1024, 0), filename: "big-part1.webm", mimeType: "audio/webm" },
      { buffer: Buffer.alloc(1024, 0), filename: "big-part2.webm", mimeType: "audio/webm" },
    ]);
    mockTranscriptionsCreate
      .mockResolvedValueOnce({ text: "  Part one.  ", duration: 10 })
      .mockResolvedValueOnce({ text: "  Part two.  ", duration: 20 });

    const bigBuffer = Buffer.alloc(WHISPER_MAX_BYTES + 1, 0);
    const result = await transcribeAudio(bigBuffer, "big.webm", "audio/webm");

    expect(mockSplit).toHaveBeenCalledWith(bigBuffer, "big.webm", "audio/webm");
    expect(mockTranscriptionsCreate).toHaveBeenCalledTimes(2);
    expect(jest.mocked(logCostEvent)).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      transcript: "Part one.\n\nPart two.",
      durationSeconds: 30,
    });
  });

  test("oversized file: ffmpeg split failure returns friendly error", async () => {
    mockSplit.mockRejectedValueOnce(new Error("ffmpeg exited 1"));
    const bigBuffer = Buffer.alloc(WHISPER_MAX_BYTES + 1, 0);
    const result = await transcribeAudio(bigBuffer, "big.webm", "audio/webm");

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/too large|split/i);
    }
    expect(mockTranscriptionsCreate).not.toHaveBeenCalled();
  });

  test("exactly at size limit passes through without ffmpeg", async () => {
    const limitBuffer = Buffer.alloc(WHISPER_MAX_BYTES, 0);
    mockTranscriptionsCreate.mockResolvedValue({ text: "ok", duration: 5 });

    const result = await transcribeAudio(limitBuffer, "ok.webm", "audio/webm");
    expect("error" in result).toBe(false);
    expect(mockSplit).toHaveBeenCalled();
  });

  test("parallel parts preserve chunk order when completions finish out of order", async () => {
    mockSplit.mockResolvedValueOnce([
      { buffer: Buffer.alloc(8, 0), filename: "a.webm", mimeType: "audio/webm" },
      { buffer: Buffer.alloc(8, 1), filename: "b.webm", mimeType: "audio/webm" },
      { buffer: Buffer.alloc(8, 2), filename: "c.webm", mimeType: "audio/webm" },
    ]);
    mockTranscriptionsCreate.mockImplementation(async (opts: { file: { arrayBuffer: () => Promise<ArrayBuffer> } }) => {
      const buf = Buffer.from(await opts.file.arrayBuffer());
      const idx = buf[0];
      const delaysMs = [80, 10, 40];
      await new Promise((r) => setTimeout(r, delaysMs[idx] ?? 5));
      return { text: `part-${idx}`, duration: 2 };
    });

    const bigBuffer = Buffer.alloc(WHISPER_MAX_BYTES + 1, 0);
    const result = await transcribeAudio(bigBuffer, "big.webm", "audio/webm");

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.transcript).toBe("part-0\n\npart-1\n\npart-2");
    }
    expect(mockTranscriptionsCreate).toHaveBeenCalledTimes(3);
  });

  test("limits concurrent Whisper calls (inner cap 6)", async () => {
    let inflight = 0;
    let peak = 0;
    mockSplit.mockResolvedValueOnce(
      Array.from({ length: 8 }, (_, i) => ({
        buffer: Buffer.alloc(16, i),
        filename: `chunk-${i}.webm`,
        mimeType: "audio/webm",
      }))
    );
    mockTranscriptionsCreate.mockImplementation(async (opts: { file: { arrayBuffer: () => Promise<ArrayBuffer> } }) => {
      inflight++;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 25));
      inflight--;
      const idx = Buffer.from(await opts.file.arrayBuffer())[0];
      return { text: `x${idx}`, duration: 1 };
    });

    const bigBuffer = Buffer.alloc(WHISPER_MAX_BYTES + 1, 0);
    await transcribeAudio(bigBuffer, "big.webm", "audio/webm");

    expect(peak).toBeLessThanOrEqual(6);
  });

  test("retries RateLimitError then succeeds", async () => {
    mockTranscriptionsCreate
      .mockRejectedValueOnce(new RateLimitError(429, { message: "limit" }, "limit", rateLimitHeaders))
      .mockRejectedValueOnce(new RateLimitError(429, { message: "limit" }, "limit", rateLimitHeaders))
      .mockResolvedValueOnce({ text: "finally ok", duration: 3 });

    const result = await transcribeAudio(SMALL_BUFFER, "session.webm", "audio/webm");

    expect(result).toEqual({
      transcript: "finally ok",
      durationSeconds: 3,
    });
    expect(mockTranscriptionsCreate).toHaveBeenCalledTimes(3);
  });

  test(
    "returns error after exhausting RateLimit retries",
    async () => {
      mockTranscriptionsCreate.mockRejectedValue(
        new RateLimitError(429, { message: "limit" }, "limit", rateLimitHeaders)
      );

      const result = await transcribeAudio(SMALL_BUFFER, "session.webm", "audio/webm");

      expect(result).toMatchObject({ error: expect.stringContaining("failed") });
      expect(mockTranscriptionsCreate).toHaveBeenCalledTimes(4);
    },
    15_000
  );

  test("returns error when API call throws", async () => {
    mockTranscriptionsCreate.mockRejectedValue(new Error("network timeout"));

    const result = await transcribeAudio(SMALL_BUFFER, "session.webm", "audio/webm");
    expect(result).toMatchObject({ error: expect.stringContaining("failed") });
    expect(jest.mocked(logCostEvent)).not.toHaveBeenCalled();
  });

  test("returns error when OPENAI_API_KEY is absent", async () => {
    jest.resetModules();
    jest.doMock("@/lib/env", () => ({ env: {} }));
    jest.doMock("openai", () => ({
      __esModule: true,
      default: jest.fn().mockImplementation(() => ({
        audio: { transcriptions: { create: mockTranscriptionsCreate } },
      })),
      toFile: jest.fn(),
    }));
    jest.doMock("@/lib/transcribe-ffmpeg", () => ({
      splitAudioIntoWhisperParts: jest.fn(),
    }));
    jest.doMock("@/lib/observability/cost-events", () => ({
      estimateCostUsd: () => undefined,
      logCostEvent: jest.fn().mockResolvedValue(undefined),
    }));

    const { transcribeAudio: transcribeNoKey } = await import("@/lib/transcribe");
    const result = await transcribeNoKey(SMALL_BUFFER, "session.webm", "audio/webm");

    expect(result).toMatchObject({ error: "not configured" });
    expect(mockTranscriptionsCreate).not.toHaveBeenCalled();
  });
});
