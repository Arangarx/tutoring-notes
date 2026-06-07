/**
 * Unit tests for src/lib/recording/transcribe-chunk.ts
 *
 * Tests:
 *  1. Happy path — primary model returns good transcript.
 *  2. Fallback path — quality guard trips on primary → whisper-1 used.
 *  3. Split path — oversized buffer triggers ffmpeg split, parts assembled.
 *  4. Missing API key — returns error without calling API.
 *  5. Retry on 429 then success.
 *  6. API failure after retries — returns error.
 *  7. ffmpeg split failure on oversized buffer — returns error.
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
    toFile: jest.fn().mockImplementation(
      async (buffer: Buffer, filename: string, opts: Record<string, string>) => ({
        buffer,
        name: filename,
        type: opts?.type ?? "audio/webm",
        async arrayBuffer() {
          return Uint8Array.from(buffer).buffer;
        },
      })
    ),
  };
});

jest.mock("@/lib/env", () => ({
  env: { OPENAI_API_KEY: "sk-test-key" },
}));

jest.mock("@/lib/observability/cost-events", () => ({
  estimateCostUsd: jest.fn().mockReturnValue(0.001),
  logCostEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/transcribe-ffmpeg", () => ({
  splitAudioIntoWhisperParts: jest.fn(),
}));

import { splitAudioIntoWhisperParts } from "@/lib/transcribe-ffmpeg";
import { transcribeChunk, TRANSCRIBE_PRIMARY_MODEL, TRANSCRIBE_FALLBACK_MODEL } from "@/lib/recording/transcribe-chunk";
import { WHISPER_MAX_BYTES } from "@/lib/transcribe-constants";

const mockSplit = splitAudioIntoWhisperParts as jest.MockedFunction<typeof splitAudioIntoWhisperParts>;

const SMALL_BUFFER = Buffer.alloc(1024, 0xaa);
const SESSION_ID = "test-session-123";
const rateLimitHeaders = new Headers();

describe("transcribeChunk", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: split returns the original buffer as a single part.
    mockSplit.mockImplementation(async (buffer, filename, mimeType) => [
      { buffer, filename, mimeType: mimeType.split(";")[0].trim() },
    ]);
  });

  // -------------------------------------------------------------------------
  // 1. Happy path — primary model
  // -------------------------------------------------------------------------
  test("happy path: returns transcript and durationMs from primary model", async () => {
    mockTranscriptionsCreate.mockResolvedValue({
      text: "  Reviewed quadratic formula today.  ",
      duration: 30.5,
    });

    const result = await transcribeChunk({
      buffer: SMALL_BUFFER,
      filename: "chunk.webm",
      mimeType: "audio/webm",
      sessionId: SESSION_ID,
    });

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.transcript).toBe("Reviewed quadratic formula today.");
      expect(result.durationMs).toBe(30500);
      expect(result.modelUsed).toBe(TRANSCRIBE_PRIMARY_MODEL);
    }
    expect(mockTranscriptionsCreate).toHaveBeenCalledTimes(1);
    expect(mockTranscriptionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: TRANSCRIBE_PRIMARY_MODEL })
    );
  });

  // -------------------------------------------------------------------------
  // 2. Fallback path — quality guard trips
  // -------------------------------------------------------------------------
  test("fallback: quality guard trips on primary result → whisper-1 used", async () => {
    mockTranscriptionsCreate
      // Primary call returns a hallucination ("thanks for watching" pattern).
      .mockResolvedValueOnce({ text: "Thanks for watching!", duration: 1.5 })
      // Fallback (whisper-1) returns real content.
      .mockResolvedValueOnce({ text: "Student struggled with factoring.", duration: 45 });

    const result = await transcribeChunk({
      buffer: SMALL_BUFFER,
      filename: "chunk.webm",
      mimeType: "audio/webm",
      sessionId: SESSION_ID,
    });

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.transcript).toBe("Student struggled with factoring.");
      expect(result.durationMs).toBe(45000);
      expect(result.modelUsed).toBe(TRANSCRIBE_FALLBACK_MODEL);
    }
    // Two calls: primary + fallback.
    expect(mockTranscriptionsCreate).toHaveBeenCalledTimes(2);
    const calls = mockTranscriptionsCreate.mock.calls;
    expect(calls[0][0]).toMatchObject({ model: TRANSCRIBE_PRIMARY_MODEL });
    expect(calls[1][0]).toMatchObject({ model: TRANSCRIBE_FALLBACK_MODEL });
  });

  // -------------------------------------------------------------------------
  // 3. Split path — buffer exceeds limit
  // -------------------------------------------------------------------------
  test("split: oversized buffer is split and transcripts assembled in order", async () => {
    mockSplit.mockResolvedValueOnce([
      { buffer: Buffer.alloc(8, 0x01), filename: "chunk-part1.webm", mimeType: "audio/webm" },
      { buffer: Buffer.alloc(8, 0x02), filename: "chunk-part2.webm", mimeType: "audio/webm" },
    ]);
    mockTranscriptionsCreate
      .mockResolvedValueOnce({ text: "Part one content.", duration: 15 })
      .mockResolvedValueOnce({ text: "Part two content.", duration: 20 });

    const bigBuffer = Buffer.alloc(WHISPER_MAX_BYTES + 1, 0);
    const result = await transcribeChunk({
      buffer: bigBuffer,
      filename: "long-chunk.webm",
      mimeType: "audio/webm",
      sessionId: SESSION_ID,
    });

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.transcript).toBe("Part one content.\n\nPart two content.");
      expect(result.durationMs).toBe(35000);
    }
    expect(mockTranscriptionsCreate).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // 4. Missing API key
  // -------------------------------------------------------------------------
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
      estimateCostUsd: jest.fn(),
      logCostEvent: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock("@/lib/whisper-guardrails", () => ({
      looksLikeSilenceHallucination: jest.fn().mockReturnValue(false),
    }));

    const { transcribeChunk: noKeyFn } = await import("@/lib/recording/transcribe-chunk");
    const result = await noKeyFn({
      buffer: SMALL_BUFFER,
      filename: "chunk.webm",
      mimeType: "audio/webm",
      sessionId: SESSION_ID,
    });

    expect(result).toMatchObject({ error: expect.stringContaining("OPENAI_API_KEY") });
    expect(mockTranscriptionsCreate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 5. Retry on rate-limit then success
  // -------------------------------------------------------------------------
  test(
    "retries on RateLimitError then succeeds",
    async () => {
      mockTranscriptionsCreate
        .mockRejectedValueOnce(new RateLimitError(429, { message: "limit" }, "limit", rateLimitHeaders))
        .mockResolvedValueOnce({ text: "Eventually works.", duration: 10 });

      const result = await transcribeChunk({
        buffer: SMALL_BUFFER,
        filename: "chunk.webm",
        mimeType: "audio/webm",
        sessionId: SESSION_ID,
      });

      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.transcript).toBe("Eventually works.");
      }
      expect(mockTranscriptionsCreate).toHaveBeenCalledTimes(2);
    },
    10_000
  );

  // -------------------------------------------------------------------------
  // 6. API failure after exhausting retries
  // -------------------------------------------------------------------------
  test(
    "returns error after exhausting retries",
    async () => {
      mockTranscriptionsCreate.mockRejectedValue(
        new RateLimitError(429, { message: "limit" }, "limit", rateLimitHeaders)
      );

      const result = await transcribeChunk({
        buffer: SMALL_BUFFER,
        filename: "chunk.webm",
        mimeType: "audio/webm",
        sessionId: SESSION_ID,
      });

      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect(result.error).toMatch(/failed|limit/i);
      }
    },
    20_000
  );

  // -------------------------------------------------------------------------
  // 7. ffmpeg split failure on oversized buffer
  // -------------------------------------------------------------------------
  test("returns error when ffmpeg split fails on oversized buffer", async () => {
    mockSplit.mockRejectedValueOnce(new Error("ffmpeg exited 1"));
    const bigBuffer = Buffer.alloc(WHISPER_MAX_BYTES + 1, 0);

    const result = await transcribeChunk({
      buffer: bigBuffer,
      filename: "big.webm",
      mimeType: "audio/webm",
      sessionId: SESSION_ID,
    });

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/ffmpeg|split/i);
    }
    expect(mockTranscriptionsCreate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 8. Null durationMs when API omits duration
  // -------------------------------------------------------------------------
  test("returns null durationMs when API omits duration field", async () => {
    mockTranscriptionsCreate.mockResolvedValue({ text: "Hello." });

    const result = await transcribeChunk({
      buffer: SMALL_BUFFER,
      filename: "chunk.webm",
      mimeType: "audio/webm",
      sessionId: SESSION_ID,
    });

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.durationMs).toBeNull();
    }
  });
});
