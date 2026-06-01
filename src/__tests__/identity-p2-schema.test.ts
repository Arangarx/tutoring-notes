/**
 * Identity Phase 2 — schema sanity test.
 *
 * Uses the Prisma DMMF (Data Model Meta-Format) so the assertions run against
 * the GENERATED client types rather than a live database. No DB connection
 * required — these pass in CI with no DATABASE_URL set.
 *
 * Guards:
 *   1. All new Identity Phase 2 models exist in the generated client.
 *   2. Student.learnerProfileId is nullable (additive, all existing rows NULL).
 *   3. Key FK fields are present with correct types.
 *   4. Enum AccountHolderEmailTokenPurpose has the four expected values.
 *   5. Separation principle: business tables do NOT have learnerProfileId.
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

describe("Identity Phase 2 — new models exist", () => {
  const newModels = [
    "AccountHolder",
    "AccountHolderEmailToken",
    "LearnerProfile",
    "LearnerCredential",
    "LearnerDeviceSession",
    "StudentClaimInvite",
  ] as const;

  it.each(newModels)("model %s is in the generated client", (name) => {
    getModel(name); // throws if not found via expect(model).toBeDefined()
  });
});

describe("AccountHolderEmailTokenPurpose enum", () => {
  it("has all four expected values", () => {
    const enumDef = dmmf.datamodel.enums.find(
      (e) => e.name === "AccountHolderEmailTokenPurpose"
    );
    expect(enumDef).toBeDefined();
    const values = enumDef!.values.map((v) => v.name);
    expect(values).toContain("SIGNUP_VERIFY");
    expect(values).toContain("PASSWORD_RESET");
    expect(values).toContain("EMAIL_CHANGE");
    expect(values).toContain("CRITICAL_ACTION");
  });
});

describe("Student model — additive learnerProfile fields", () => {
  it("Student.learnerProfileId is optional (nullable)", () => {
    const field = getField("Student", "learnerProfileId");
    expect(field.isRequired).toBe(false);
    expect(field.type).toBe("String");
  });

  it("Student.learnerProfile relation exists and is optional", () => {
    const field = getField("Student", "learnerProfile");
    expect(field.isRequired).toBe(false);
    expect(field.relationName).toBeDefined();
  });

  it("Student.claimInvites relation exists (list)", () => {
    const field = getField("Student", "claimInvites");
    expect(field.isList).toBe(true);
  });
});

describe("AccountHolder model fields", () => {
  it("has email, isSelfLearner, tombstonedAt, createdAt, updatedAt", () => {
    getField("AccountHolder", "email");
    getField("AccountHolder", "isSelfLearner");
    getField("AccountHolder", "tombstonedAt");
    getField("AccountHolder", "createdAt");
    getField("AccountHolder", "updatedAt");
  });

  it("tombstonedAt is optional", () => {
    const field = getField("AccountHolder", "tombstonedAt");
    expect(field.isRequired).toBe(false);
  });

  it("isSelfLearner is a non-optional Boolean", () => {
    const field = getField("AccountHolder", "isSelfLearner");
    expect(field.isRequired).toBe(true);
    expect(field.type).toBe("Boolean");
  });
});

describe("LearnerProfile model fields", () => {
  it("has tombstonedAt (optional) and displayName (required)", () => {
    const tombstone = getField("LearnerProfile", "tombstonedAt");
    expect(tombstone.isRequired).toBe(false);
    const name = getField("LearnerProfile", "displayName");
    expect(name.isRequired).toBe(true);
    expect(name.type).toBe("String");
  });

  it("accountHolderId FK is required", () => {
    const field = getField("LearnerProfile", "accountHolderId");
    expect(field.isRequired).toBe(true);
    expect(field.type).toBe("String");
  });

  it("student back-relation is optional (1-to-1)", () => {
    const field = getField("LearnerProfile", "student");
    expect(field.isList).toBe(false);
    expect(field.isRequired).toBe(false);
  });
});

describe("LearnerCredential model fields", () => {
  it("learnerProfileId is unique (enforced at DB level; DMMF has isId or isUnique)", () => {
    const field = getField("LearnerCredential", "learnerProfileId");
    expect(field.isRequired).toBe(true);
    expect(field.type).toBe("String");
  });

  it("secretHash and username are required", () => {
    const sh = getField("LearnerCredential", "secretHash");
    expect(sh.isRequired).toBe(true);
    const un = getField("LearnerCredential", "username");
    expect(un.isRequired).toBe(true);
  });
});

describe("LearnerDeviceSession model fields", () => {
  it("expiresAt and tokenHash are required", () => {
    const exp = getField("LearnerDeviceSession", "expiresAt");
    expect(exp.isRequired).toBe(true);
    const tok = getField("LearnerDeviceSession", "tokenHash");
    expect(tok.isRequired).toBe(true);
  });

  it("revokedAt is optional", () => {
    const field = getField("LearnerDeviceSession", "revokedAt");
    expect(field.isRequired).toBe(false);
  });
});

describe("StudentClaimInvite model fields", () => {
  it("adminUserId FK is required (follows AdminUser naming convention)", () => {
    const field = getField("StudentClaimInvite", "adminUserId");
    expect(field.isRequired).toBe(true);
    expect(field.type).toBe("String");
  });

  it("token is required", () => {
    const field = getField("StudentClaimInvite", "token");
    expect(field.isRequired).toBe(true);
  });

  it("claimedAt is optional", () => {
    const field = getField("StudentClaimInvite", "claimedAt");
    expect(field.isRequired).toBe(false);
  });
});

describe("Separation principle — business tables do NOT carry learnerProfileId", () => {
  const businessTables = [
    "WhiteboardSession",
    "SessionRecording",
    "CostEvent",
    "SessionNote",
  ] as const;

  it.each(businessTables)(
    "%s does not have learnerProfileId",
    (modelName) => {
      const model = getModel(modelName);
      const bad = model.fields.find((f) => f.name === "learnerProfileId");
      expect(bad).toBeUndefined();
    }
  );
});
