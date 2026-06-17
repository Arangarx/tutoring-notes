import { deriveWbCapabilities } from "@/components/whiteboard/chrome/wb-role";

describe("deriveWbCapabilities", () => {
  it("student role enables laser broadcast and disables page authority + inserts", () => {
    const caps = deriveWbCapabilities("student");
    expect(caps.canBroadcastLaser).toBe(true);
    expect(caps.canSwitchPage).toBe(false);
    expect(caps.canAddPage).toBe(false);
    expect(caps.canDeletePage).toBe(false);
    expect(caps.canInsertAssets).toBe(false);
    expect(caps.canShareLink).toBe(false);
    expect(caps.showLeaveInsteadOfEnd).toBe(true);
    expect(caps.showFollowControls).toBe(true);
  });

  it("tutor role keeps full page authority and laser", () => {
    const caps = deriveWbCapabilities("tutor");
    expect(caps.canBroadcastLaser).toBe(true);
    expect(caps.canSwitchPage).toBe(true);
    expect(caps.canAddPage).toBe(true);
    expect(caps.canInsertAssets).toBe(true);
    expect(caps.canShareLink).toBe(true);
    expect(caps.showLeaveInsteadOfEnd).toBe(false);
  });
});
