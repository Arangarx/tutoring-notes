/**
 * @jest-environment jsdom
 *
 * One backup-code panel: the codes shown, copy, and a .txt download.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BackupCodesPanel } from "@/components/identity/BackupCodesPanel";

const CODES = ["XE2W4V7S", "C3QYBSWT"];

describe("BackupCodesPanel", () => {
  it("shows every code and both save actions", () => {
    render(
      <BackupCodesPanel
        codes={CODES}
        title="Backup codes — shown once only"
        description="Save these in a safe place."
      />
    );

    expect(screen.getByRole("heading", { name: "Backup codes — shown once only" })).toBeTruthy();
    expect(screen.getByText("Save these in a safe place.")).toBeTruthy();
    expect(screen.getByText("XE2W4V7S")).toBeTruthy();
    expect(screen.getByText("C3QYBSWT")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy codes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download .txt" })).toBeTruthy();
  });

  it("copies the codes as one code per line", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <BackupCodesPanel
        codes={CODES}
        title="Backup codes — shown once only"
        description="Save these in a safe place."
      />
    );

    await user.click(screen.getByRole("button", { name: "Copy codes" }));

    expect(writeText).toHaveBeenCalledWith("XE2W4V7S\nC3QYBSWT");
    expect(screen.getByRole("button", { name: "Copied!" })).toBeTruthy();
  });

  it("downloads a text file that contains the header and every code", async () => {
    const user = userEvent.setup();
    let saved: Blob | null = null;
    jest.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      saved = blob as Blob;
      return "blob:backup-codes";
    });
    jest.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      expect(this.download).toBe("mynk-2fa-backup-codes.txt");
    });

    render(
      <BackupCodesPanel
        codes={CODES}
        title="Backup codes — shown once only"
        description="Save these in a safe place."
        fileHeader="Mynk 2FA Backup Codes (post-rotation) — store these in a safe place.\n\n"
      />
    );

    await user.click(screen.getByRole("button", { name: "Download .txt" }));

    expect(click).toHaveBeenCalled();
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(saved!);
    });
    expect(text).toContain("post-rotation");
    expect(text).toContain("XE2W4V7S");
    expect(text).toContain("C3QYBSWT");
  });
});
