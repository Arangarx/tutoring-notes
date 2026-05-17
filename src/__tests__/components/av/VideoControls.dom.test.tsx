/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import VideoControls from "@/components/av/VideoControls";

function makeDevice(
  id: string,
  label: string,
  groupId: string,
  kind: MediaDeviceInfo["kind"] = "videoinput"
): MediaDeviceInfo {
  return {
    deviceId: id,
    groupId,
    kind,
    label,
    toJSON() {
      return this;
    },
  } as MediaDeviceInfo;
}

describe("VideoControls", () => {
  test("renders placeholder when no devices and not live", () => {
    render(
      <VideoControls
        devices={[]}
        selectedPickerSlot={0}
        onPickCameraSlot={() => {}}
        isLive={false}
      />
    );
    expect(
      screen.getByRole("combobox", { name: /camera device/i })
    ).toHaveTextContent("(allow camera access to choose)");
  });

  test("lists devices by slot index and fires onPickCameraSlot", async () => {
    const user = userEvent.setup();
    const onPickCameraSlot = jest.fn();
    const d0 = makeDevice("dup-a", "Front", "grp0");
    const d1 = makeDevice("dup-a", "Back", "grp1");
    render(
      <VideoControls
        devices={[d0, d1]}
        selectedPickerSlot={0}
        onPickCameraSlot={onPickCameraSlot}
        isLive
      />
    );
    const sel = screen.getByRole("combobox", { name: /camera device/i });
    expect(sel).toHaveAttribute("title", "Front");
    await user.selectOptions(sel, "1");
    expect(onPickCameraSlot).toHaveBeenCalledWith(1);
  });
});
