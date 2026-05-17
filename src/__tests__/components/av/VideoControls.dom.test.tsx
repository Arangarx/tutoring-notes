/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import VideoControls from "@/components/av/VideoControls";

function makeDevice(
  id: string,
  label: string,
  kind: MediaDeviceInfo["kind"] = "videoinput"
): MediaDeviceInfo {
  return {
    deviceId: id,
    groupId: "g",
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
        selectedDeviceId=""
        onDeviceChange={() => {}}
        isLive={false}
      />
    );
    expect(
      screen.getByRole("combobox", { name: /camera device/i })
    ).toHaveTextContent("(allow camera access to choose)");
  });

  test("lists devices and fires onDeviceChange", async () => {
    const user = userEvent.setup();
    const onDeviceChange = jest.fn();
    const d0 = makeDevice("dev-a", "USB Webcam (1908:2310)");
    const d1 = makeDevice("dev-b", "Integrated Camera");
    render(
      <VideoControls
        devices={[d0, d1]}
        selectedDeviceId="dev-a"
        onDeviceChange={onDeviceChange}
        isLive
      />
    );
    const sel = screen.getByRole("combobox", { name: /camera device/i });
    expect(sel).toHaveAttribute("title", "USB Webcam (1908:2310)");
    await user.selectOptions(sel, "dev-b");
    expect(onDeviceChange).toHaveBeenCalledWith("dev-b");
  });
});
