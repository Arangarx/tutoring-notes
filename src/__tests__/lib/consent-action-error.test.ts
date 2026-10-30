/**
 * @jest-environment node
 *
 * What a tutor reads after a refused Start. The rule (W4 / consent spec): it is the same
 * sentence the disabled control shows for that learner's situation, with the "Parent
 * account section" hint only where it fits. Expected strings are written by hand; they are
 * not read from `ENTRY_BLOCK_COPY` (that would pass by construction).
 */

import { formatConsentActionError, parseConsentActionError } from "@/lib/consent-action-error";

const PARENT_HINT =
  "Go to the Parent account section on this student's page to send a claim invite or check connection status.";

function consentRecordError(message: string) {
  return Object.assign(new Error(message), { name: "ConsentError", permission: "consentRecord" });
}

function shown(message: string): string {
  const parsed = parseConsentActionError(consentRecordError(message));
  if (!parsed) throw new Error("not recognised as a consent error");
  return formatConsentActionError(parsed);
}

describe("formatConsentActionError — consentRecord refusals", () => {
  it("self-learner: their own line, no Parent-account hint", () => {
    expect(shown("Maya hasn't finished privacy preferences yet.")).toBe(
      "Maya hasn't finished privacy preferences yet."
    );
  });

  it("self-learner with a different name keeps that name", () => {
    expect(shown("Jo Lee hasn't finished privacy preferences yet.")).toBe(
      "Jo Lee hasn't finished privacy preferences yet."
    );
  });

  it("parent-held learner: the parent line plus the Parent-account hint", () => {
    expect(shown("The parent hasn't finished privacy preferences yet.")).toBe(
      `The parent hasn't finished privacy preferences yet.\n\n${PARENT_HINT}`
    );
  });

  it("unclaimed learner: the unclaimed line plus the claim-invite hint", () => {
    expect(shown("Maya hasn't connected their Mynk account yet.")).toBe(
      `Maya hasn't connected their Mynk account yet.\n\n${PARENT_HINT}`
    );
  });

  it("the legacy generic server message still maps to the parent line + hint", () => {
    expect(shown("Parent privacy preferences must be set before starting a session.")).toBe(
      `The parent hasn't finished privacy preferences yet.\n\n${PARENT_HINT}`
    );
  });

  it("an allowLiveSession refusal is shown verbatim", () => {
    const parsed = parseConsentActionError(
      Object.assign(new Error("Live sessions are off in Maya's privacy settings."), {
        name: "ConsentError",
        permission: "allowLiveSession",
      })
    );
    expect(parsed).not.toBeNull();
    expect(formatConsentActionError(parsed!)).toBe("Live sessions are off in Maya's privacy settings.");
  });
});
