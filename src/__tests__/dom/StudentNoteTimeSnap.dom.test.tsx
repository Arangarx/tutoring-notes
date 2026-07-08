/**
 * @jest-environment jsdom
 */

/**
 * P2-J2 / BILL-04 — note time-entry 5-minute snap (DOM contract).
 *
 * Behavior oracle: when an off-grid wall-clock time arrives at the note
 * form (AI recording prefill via populate()), the session start/end inputs
 * show the nearest 5-minute HH:MM — not the raw minute count.
 *
 * Independent oracle: `oracleSnapHHMM` below (never imported from impl).
 *
 * RED-BEFORE (2026-07-05): asserting the raw off-grid value "14:07" on the
 * start input after populate fails; only the snapped "14:05" passes.
 *
 * Note: manual tutor typing does not re-snap on change (controlled input
 * stores the typed value); the snap contract under test is the display path
 * for AI-prefilled recording timestamps in NewNoteForm.
 */

import { createRef } from "react";
import { act, render, screen } from "@testing-library/react";

jest.mock("@/app/admin/students/[id]/actions", () => ({
  __esModule: true,
  createNote: jest.fn(),
}));

import NewNoteForm, {
  type NewNoteFormHandle,
  type PopulatePayload,
} from "@/app/admin/students/[id]/NewNoteForm";

function oracleSnapHHMM(hours: number, minutes: number): string {
  const totalMin = hours * 60 + minutes;
  const snapped = Math.round(totalMin / 5) * 5;
  const wrapped = ((snapped % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = Math.floor(wrapped / 60)
    .toString()
    .padStart(2, "0");
  const mm = (wrapped % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Build a local Date at HH:MM and return its ISO string for populate(). */
function localIsoAt(hours: number, minutes: number): string {
  const d = new Date(2026, 3, 22, hours, minutes, 0);
  return d.toISOString();
}

const MINIMAL_PAYLOAD: PopulatePayload = {
  topics: "",
  homework: "",
  assessment: "",
  plan: "",
  links: "",
  promptVersion: "snap-test",
};

function renderForm() {
  const ref = createRef<NewNoteFormHandle>();
  render(<NewNoteForm ref={ref} studentId="student-1" />);
  if (!ref.current) throw new Error("ref not attached after mount");
  return ref as { current: NewNoteFormHandle };
}

async function populate(
  ref: { current: NewNoteFormHandle },
  payload: PopulatePayload
): Promise<void> {
  await act(async () => {
    ref.current.populate(payload);
  });
}

describe("Student note time entry — 5-minute snap display (P2-J2)", () => {
  it("session start shows snapped 14:05 when AI prefill wall-clock is 14:07", async () => {
    const ref = renderForm();
    const startInput = screen.getByLabelText(/session start/i) as HTMLInputElement;

    await populate(ref, {
      ...MINIMAL_PAYLOAD,
      sessionStartedAt: localIsoAt(14, 7),
    });

    const expected = oracleSnapHHMM(14, 7);
    expect(expected).toBe("14:05");
    expect(startInput.value).toBe(expected);
    expect(startInput.value).not.toBe("14:07");
  });

  it("session end shows snapped 10:55 when AI prefill wall-clock is 10:53", async () => {
    const ref = renderForm();
    const endInput = screen.getByLabelText(/session end/i) as HTMLInputElement;

    await populate(ref, {
      ...MINIMAL_PAYLOAD,
      sessionEndedAt: localIsoAt(10, 53),
    });

    expect(endInput.value).toBe(oracleSnapHHMM(10, 53));
    expect(endInput.value).toBe("10:55");
  });

  it("leaves on-grid 10:30 unchanged after AI prefill", async () => {
    const ref = renderForm();
    const startInput = screen.getByLabelText(/session start/i) as HTMLInputElement;

    await populate(ref, {
      ...MINIMAL_PAYLOAD,
      sessionStartedAt: localIsoAt(10, 30),
    });

    expect(startInput.value).toBe("10:30");
  });

  it("time inputs declare step=300 (5-minute HTML grid)", () => {
    renderForm();
    const startInput = screen.getByLabelText(/session start/i) as HTMLInputElement;
    const endInput = screen.getByLabelText(/session end/i) as HTMLInputElement;
    expect(startInput.step).toBe("300");
    expect(endInput.step).toBe("300");
  });
});
