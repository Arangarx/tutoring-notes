/**
 * @jest-environment node
 *
 * The one entry rule. The expected table below is written by hand from the spec
 * (org UX plan W4, Andrew's 2026-10-28/29 locked decisions), NOT derived from the
 * implementation:
 *
 *  - Decision 5: "Allow online sessions" governs ONLINE only; in person stays allowed.
 *  - 16:23 lock: no consent record means no session at all, online or in person.
 *  - Precedence: erasure > org inactive > instructor not admitted > unclaimed > no record > online off.
 */

import {
  ENTRY_BLOCK_COPY,
  ENTRY_CARD_TITLE,
  ENTRY_IN_PERSON_STILL_OPEN,
  ENTRY_UNAVAILABLE,
  decisionReason,
  entryBlockCopy,
  entryCardParagraphs,
  familySafeEntryState,
  familySafeReason,
  sessionEntryState,
  tutorControlState,
  type EntryBlockReason,
  type SessionEntryInputs,
  type SessionEntryState,
} from "@/lib/scheduling/session-entry";

const OK = { allowed: true } as const;
const no = (reason: EntryBlockReason) => ({ allowed: false, reason }) as const;
const both = (reason: EntryBlockReason): SessionEntryState => ({
  online: no(reason),
  inPerson: no(reason),
});

/** A healthy personal-tutor learner. Each row overrides only what it is about. */
const HEALTHY: SessionEntryInputs = {
  erasureSuspended: false,
  org: null,
  claimed: true,
  isSelfLearner: false,
  consent: { allowLiveSession: true },
};

type Row = { name: string; inputs: Partial<SessionEntryInputs>; expected: SessionEntryState };

const TABLE: Row[] = [
  // --- the happy and Decision-5 rows ---
  { name: "personal, consent allows live", inputs: {}, expected: { online: OK, inPerson: OK } },
  {
    name: "online off: online blocked live_off, in person still allowed (Decision 5)",
    inputs: { consent: { allowLiveSession: false } },
    expected: { online: no("live_off"), inPerson: OK },
  },
  {
    name: "org active + admitted + consent: both allowed",
    inputs: { org: { active: true, instructorAdmitted: true } },
    expected: { online: OK, inPerson: OK },
  },
  {
    name: "org active + admitted + online off: in person still allowed",
    inputs: { org: { active: true, instructorAdmitted: true }, consent: { allowLiveSession: false } },
    expected: { online: no("live_off"), inPerson: OK },
  },

  // --- no consent record: both modes blocked (16:23 lock), reason depends on who answers ---
  {
    name: "no record, parent-held: both blocked consent_missing_parent",
    inputs: { consent: null },
    expected: both("consent_missing_parent"),
  },
  {
    name: "no record, self-learner: both blocked consent_missing_self",
    inputs: { consent: null, isSelfLearner: true },
    expected: both("consent_missing_self"),
  },

  // --- unclaimed ---
  { name: "unclaimed: both blocked", inputs: { claimed: false, consent: null }, expected: both("unclaimed") },
  {
    name: "unclaimed beats online-off (nothing else is reachable)",
    inputs: { claimed: false, consent: { allowLiveSession: false } },
    expected: both("unclaimed"),
  },

  // --- org gates ---
  {
    name: "org inactive: both blocked org_inactive",
    inputs: { org: { active: false, instructorAdmitted: true } },
    expected: both("org_inactive"),
  },
  {
    name: "instructor not admitted: both blocked instructor_not_admitted",
    inputs: { org: { active: true, instructorAdmitted: false } },
    expected: both("instructor_not_admitted"),
  },
  {
    name: "org inactive wins over instructor not admitted",
    inputs: { org: { active: false, instructorAdmitted: false } },
    expected: both("org_inactive"),
  },
  {
    name: "org inactive wins over unclaimed and no record",
    inputs: { org: { active: false, instructorAdmitted: true }, claimed: false, consent: null },
    expected: both("org_inactive"),
  },
  {
    name: "instructor not admitted wins over unclaimed",
    inputs: { org: { active: true, instructorAdmitted: false }, claimed: false },
    expected: both("instructor_not_admitted"),
  },

  // --- erasure beats everything ---
  { name: "erasure pending: both blocked", inputs: { erasureSuspended: true }, expected: both("erasure_pending") },
  {
    name: "erasure wins over org inactive, unclaimed, no record",
    inputs: {
      erasureSuspended: true,
      org: { active: false, instructorAdmitted: false },
      claimed: false,
      consent: null,
    },
    expected: both("erasure_pending"),
  },
];

describe("sessionEntryState truth table (hand-written from the spec)", () => {
  it.each(TABLE)("$name", ({ inputs, expected }) => {
    expect(sessionEntryState({ ...HEALTHY, ...inputs })).toEqual(expected);
  });

  it("never blocks in person while allowing online (online is always the stricter mode)", () => {
    const flags = [true, false];
    for (const erasureSuspended of flags)
      for (const claimed of flags)
        for (const isSelfLearner of flags)
          for (const org of [
            null,
            { active: true, instructorAdmitted: true },
            { active: true, instructorAdmitted: false },
            { active: false, instructorAdmitted: true },
          ])
            for (const consent of [null, { allowLiveSession: true }, { allowLiveSession: false }]) {
              const state = sessionEntryState({
                erasureSuspended,
                org,
                claimed,
                isSelfLearner,
                consent,
              });
              if (state.online.allowed) expect(state.inPerson.allowed).toBe(true);
            }
  });

  it("allows online only when nothing blocks and consent allows live", () => {
    // Independent oracle for the whole input space: online is allowed iff all of these hold.
    const flags = [true, false];
    for (const erasureSuspended of flags)
      for (const claimed of flags)
        for (const orgOk of [null, true, false])
          for (const consent of [null, { allowLiveSession: true }, { allowLiveSession: false }]) {
            const state = sessionEntryState({
              erasureSuspended,
              org: orgOk === null ? null : { active: orgOk, instructorAdmitted: orgOk },
              claimed,
              isSelfLearner: false,
              consent,
            });
            const expectedOnline =
              !erasureSuspended && claimed && orgOk !== false && consent?.allowLiveSession === true;
            const expectedInPerson = !erasureSuspended && claimed && orgOk !== false && consent !== null;
            expect(state.online.allowed).toBe(expectedOnline);
            expect(state.inPerson.allowed).toBe(expectedInPerson);
          }
  });

  it("does not mutate shared decision objects between calls", () => {
    const a = sessionEntryState(HEALTHY);
    (a.online as { allowed: boolean }).allowed = false;
    expect(sessionEntryState(HEALTHY).online.allowed).toBe(true);
  });
});

describe("decisionReason / tutorControlState", () => {
  it("decisionReason is null when allowed and the code when blocked", () => {
    expect(decisionReason(OK)).toBeNull();
    expect(decisionReason(no("live_off"))).toBe("live_off");
  });

  it("tutor control: both blocked disables with the shared reason", () => {
    expect(tutorControlState(both("unclaimed"))).toEqual({
      disabledReason: "unclaimed",
      onlineOnlyReason: null,
    });
  });

  it("tutor control: online off stays enabled and carries the online-only reason", () => {
    expect(tutorControlState({ online: no("live_off"), inPerson: OK })).toEqual({
      disabledReason: null,
      onlineOnlyReason: "live_off",
    });
  });

  it("tutor control: everything allowed has no reason at all", () => {
    expect(tutorControlState({ online: OK, inPerson: OK })).toEqual({
      disabledReason: null,
      onlineOnlyReason: null,
    });
  });

  it("the unavailable placeholder blocks both modes with a copy-backed reason", () => {
    expect(ENTRY_UNAVAILABLE).toEqual(both("unknown"));
  });
});

describe("entry copy (every reason, every audience, never blank)", () => {
  const REASONS: EntryBlockReason[] = [
    "unclaimed",
    "consent_missing_self",
    "consent_missing_parent",
    "live_off",
    "not_yet",
    "org_inactive",
    "instructor_not_admitted",
    "erasure_pending",
    "unknown",
  ];

  it("the table covers exactly the closed reason set", () => {
    expect(Object.keys(ENTRY_BLOCK_COPY).sort()).toEqual([...REASONS].sort());
  });

  it.each(REASONS)("%s has a non-empty line for tutor, family and scheduler", (reason) => {
    for (const audience of ["tutor", "family", "scheduler"] as const) {
      const text = entryBlockCopy(reason, audience, "Maya");
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toContain("{name}");
    }
  });

  it("family copy never reveals org-internal state", () => {
    for (const reason of ["org_inactive", "instructor_not_admitted"] as const) {
      const family = entryBlockCopy(reason, "family", "Maya");
      expect(family).not.toMatch(/organi[sz]ation|instructor|admit/i);
      expect(family).toBe("This session isn't available right now.");
    }
  });

  it("hand-written lines the spec names", () => {
    expect(entryBlockCopy("live_off", "tutor", "Maya")).toBe(
      "Live sessions are off in Maya's privacy settings."
    );
    expect(entryBlockCopy("live_off", "scheduler", "Maya")).toBe("Live sessions are off");
    expect(entryBlockCopy("unclaimed", "scheduler", "Maya")).toBe("Waiting on the family");
    expect(entryBlockCopy("consent_missing_parent", "family", "Maya")).toBe(
      "Finish privacy preferences for Maya to join."
    );
    expect(entryBlockCopy("not_yet", "family", "Maya")).toBe(
      "Join opens 15 minutes before the start."
    );
    expect(ENTRY_IN_PERSON_STILL_OPEN).toBe("You can still open the room in person.");
  });

  it("an unrecognised reason (stale client) falls back to the generic line, never blank", () => {
    const text = entryBlockCopy("from_the_future" as EntryBlockReason, "tutor", "Maya");
    expect(text).toBe("This session can't be opened right now.");
  });

  it("an empty learner name reads 'The learner', not a hole", () => {
    expect(entryBlockCopy("live_off", "tutor", "   ")).toBe(
      "Live sessions are off in The learner's privacy settings."
    );
  });
});

describe("family-safe reasons (a family never learns org-internal state)", () => {
  const INTERNAL: EntryBlockReason[] = [
    "org_inactive",
    "instructor_not_admitted",
    "erasure_pending",
    "unclaimed",
  ];

  it.each(INTERNAL)("%s collapses to the generic reason", (reason) => {
    expect(familySafeReason(reason)).toBe("unknown");
    expect(familySafeEntryState(both(reason))).toEqual(both("unknown"));
  });

  it.each(["consent_missing_self", "consent_missing_parent", "live_off", "not_yet", "unknown"] as const)(
    "%s is something the family can act on or already sees, and stays",
    (reason) => {
      expect(familySafeReason(reason)).toBe(reason);
    }
  );

  it("keeps allowed decisions allowed and collapses only the blocked mode", () => {
    expect(familySafeEntryState({ online: no("live_off"), inPerson: OK })).toEqual({
      online: no("live_off"),
      inPerson: OK,
    });
    expect(familySafeEntryState({ online: OK, inPerson: OK })).toEqual({ online: OK, inPerson: OK });
  });

  it("an unrecognised reason (stale code) collapses too, never passes through", () => {
    expect(familySafeReason("from_the_future" as EntryBlockReason)).toBe("unknown");
  });
});

describe("one copy table: the tutor callout text lives in ENTRY_BLOCK_COPY", () => {
  it("the three callout reasons carry their paragraphs in the table (hand-written from the spec)", () => {
    expect(entryCardParagraphs("consent_missing_self", "Maya")).toEqual([
      "This learner's privacy preferences are not complete. You cannot start a session until they finish them.",
      "They finish privacy preferences under Manage → Privacy in their Mynk account.",
    ]);
    expect(entryCardParagraphs("consent_missing_parent", "Maya")).toEqual([
      "A parent account is connected, but privacy preferences are not complete. You cannot start a session until the parent finishes them.",
      "Ask the parent to sign in to their Mynk account and complete privacy preferences for this learner. They can find this under their child's profile in Account.",
    ]);
    expect(entryCardParagraphs("unclaimed", "Maya")).toEqual([
      "Before you can start a session, the student's parent must claim this account and set privacy preferences.",
    ]);
  });

  it("a reason without callout text shows its one tutor line, with the name filled in", () => {
    expect(entryCardParagraphs("live_off", "Maya")).toEqual([
      "Live sessions are off in Maya's privacy settings.",
    ]);
  });

  it("the card heading names the control it stands in for", () => {
    expect(ENTRY_CARD_TITLE.start).toBe("Start whiteboard session unavailable");
    expect(ENTRY_CARD_TITLE.openRoom).toBe("Open room unavailable");
  });
});