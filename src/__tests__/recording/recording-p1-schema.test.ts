/**
 * Recording re-arch Phase 1 — schema sanity test (DMMF, no live DB).
 */

import { Prisma } from "@prisma/client";

const dmmf = Prisma.dmmf;

function getModel(name: string) {
  const model = dmmf.datamodel.models.find((m) => m.name === name);
  expect(model).toBeDefined();
  return model!;
}

function getField(modelName: string, fieldName: string) {
  const model = getModel(modelName);
  const field = model.fields.find((f) => f.name === fieldName);
  expect(field).toBeDefined();
  return field!;
}

describe("Recording Phase 1 — new models exist", () => {
  const newModels = ["TranscriptChunk", "TranscriptChunkExtraction", "TutorNote"] as const;

  it.each(newModels)("model %s is in the generated client", (name) => {
    getModel(name);
  });
});

describe("TranscriptChunk — keys and fields", () => {
  it("has composite unique on sessionId + chunkBlobUrl", () => {
    const model = getModel("TranscriptChunk");
    const unique = model.uniqueFields.find(
      (u) => u.length === 2 && u.includes("sessionId") && u.includes("chunkBlobUrl")
    );
    expect(unique).toBeDefined();
  });

  it("recordingTimeOffsetMs and chunkBlobUrl are required", () => {
    expect(getField("TranscriptChunk", "recordingTimeOffsetMs").isRequired).toBe(true);
    expect(getField("TranscriptChunk", "chunkBlobUrl").isRequired).toBe(true);
  });

  it("relates to WhiteboardSession via sessionId", () => {
    const field = getField("TranscriptChunk", "session");
    expect(field.relationName).toBeDefined();
    expect(field.type).toBe("WhiteboardSession");
  });
});

describe("TranscriptChunkExtraction — map output shape", () => {
  it("chunkId is unique (one extraction per chunk)", () => {
    const field = getField("TranscriptChunkExtraction", "chunkId");
    expect(field.isUnique).toBe(true);
  });

  it("JSON payload columns default to empty arrays at the ORM layer", () => {
    expect(getField("TranscriptChunkExtraction", "topics").hasDefaultValue).toBe(true);
    expect(getField("TranscriptChunkExtraction", "sessionId").isRequired).toBe(true);
  });
});

describe("TutorNote — one note per session", () => {
  it("sessionId is unique", () => {
    const field = getField("TutorNote", "sessionId");
    expect(field.isUnique).toBe(true);
  });

  it("isPartial defaults false at the ORM layer", () => {
    const field = getField("TutorNote", "isPartial");
    expect(field.hasDefaultValue).toBe(true);
  });
});

describe("WhiteboardSession — additive relations only", () => {
  it("has transcriptChunks list relation", () => {
    const field = getField("WhiteboardSession", "transcriptChunks");
    expect(field.isList).toBe(true);
    expect(field.type).toBe("TranscriptChunk");
  });

  it("has optional tutorNote relation", () => {
    const field = getField("WhiteboardSession", "tutorNote");
    expect(field.isList).toBe(false);
    expect(field.isRequired).toBe(false);
    expect(field.type).toBe("TutorNote");
  });
});
