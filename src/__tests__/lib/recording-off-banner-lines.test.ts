import { recordingOffBannerLines } from "@/lib/consent-toggle-copy";

describe("recordingOffBannerLines", () => {
  it("gives each role the online audio sentence and the shared whiteboard and notes lines", () => {
    const shared = {
      audioMode: "tutor_only" as const,
      whiteboardOff: true,
      notesOff: true,
    };
    expect(recordingOffBannerLines({ audience: "tutor", ...shared })).toEqual([
      "This student's voice is not being saved. Your microphone can still be saved.",
      "The board is not being saved. It still works during this session. After the session ends, we delete the saved board from our servers.",
      "Notes are off for this session. Nothing is transcribed and no notes are drafted.",
    ]);
    expect(recordingOffBannerLines({ audience: "student", ...shared })).toEqual([
      "Your voice is not being saved. Your tutor's microphone can still be saved.",
      "The board is not being saved. It still works during this session. After the session ends, we delete the saved board from our servers.",
      "Notes are off for this session. Nothing is transcribed and no notes are drafted.",
    ]);
  });

  it("uses the none sentence for both roles and skips lines that are on", () => {
    expect(
      recordingOffBannerLines({
        audience: "tutor",
        audioMode: "none",
        whiteboardOff: false,
        notesOff: false,
      })
    ).toEqual(["Session audio is not being saved."]);
    expect(
      recordingOffBannerLines({
        audience: "student",
        audioMode: "full",
        whiteboardOff: false,
        notesOff: false,
      })
    ).toEqual([]);
  });
});
