/**
 * Unit tests for src/lib/ai-models.ts — env-resolved model names.
 */

describe("ai-models defaults", () => {
  it("uses historical literals when env overrides are absent", () => {
    jest.isolateModules(() => {
      jest.doMock("@/lib/env", () => ({ env: {} }));
      const models = require("@/lib/ai-models") as typeof import("@/lib/ai-models");

      expect(models.TRANSCRIBE_PRIMARY_MODEL).toBe("gpt-4o-mini-transcribe");
      expect(models.TRANSCRIBE_FALLBACK_MODEL).toBe("whisper-1");
      expect(models.LEGACY_TRANSCRIBE_MODEL).toBe("whisper-1");
      expect(models.MAP_MODEL).toBe("gpt-4o-mini");
      expect(models.REDUCE_MODEL).toBe("gpt-4o-mini");
      expect(models.LEGACY_NOTES_MODEL).toBe("gpt-4o-mini");
    });
  });
});

describe("ai-models env overrides", () => {
  it("resolves each model from the matching OPENAI_* env field", () => {
    jest.isolateModules(() => {
      jest.doMock("@/lib/env", () => ({
        env: {
          OPENAI_TRANSCRIBE_PRIMARY_MODEL: "custom-primary",
          OPENAI_TRANSCRIBE_FALLBACK_MODEL: "custom-fallback",
          OPENAI_LEGACY_TRANSCRIBE_MODEL: "custom-legacy-stt",
          OPENAI_MAP_MODEL: "custom-map",
          OPENAI_REDUCE_MODEL: "custom-reduce",
          OPENAI_LEGACY_NOTES_MODEL: "custom-legacy-notes",
        },
      }));
      const models = require("@/lib/ai-models") as typeof import("@/lib/ai-models");

      expect(models.TRANSCRIBE_PRIMARY_MODEL).toBe("custom-primary");
      expect(models.TRANSCRIBE_FALLBACK_MODEL).toBe("custom-fallback");
      expect(models.LEGACY_TRANSCRIBE_MODEL).toBe("custom-legacy-stt");
      expect(models.MAP_MODEL).toBe("custom-map");
      expect(models.REDUCE_MODEL).toBe("custom-reduce");
      expect(models.LEGACY_NOTES_MODEL).toBe("custom-legacy-notes");
    });
  });
});
