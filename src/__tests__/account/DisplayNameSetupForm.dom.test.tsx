/**
 * @jest-environment jsdom
 *
 * Display name stays editable after the first save (packet item 13).
 * The second save must send a different name. The field must still be there.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DisplayNameSetupForm } from "@/app/claim/[token]/setup/DisplayNameSetupForm";

describe("DisplayNameSetupForm — editable after save", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("sends a second, different name after the first save", async () => {
    const user = userEvent.setup();
    render(
      <DisplayNameSetupForm
        rawToken="tok-child"
        prompt="How do you want your child to be seen by this tutor?"
        initialDisplayName="Maya"
      />
    );

    const input = screen.getByLabelText("Display name");
    await user.clear(input);
    await user.type(input, "Maya Rodriguez");
    await user.click(screen.getByRole("button", { name: "Save display name" }));

    expect(await screen.findByTestId("display-name-saved")).toHaveTextContent(
      "Saved how you'll appear to this tutor."
    );
    expect(screen.getByLabelText("Display name")).toHaveValue("Maya Rodriguez");

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "Maya R. Lopez");
    await user.click(screen.getByRole("button", { name: "Save display name" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      displayName: string;
    };
    const second = JSON.parse(String(fetchMock.mock.calls[1][1].body)) as {
      displayName: string;
    };
    expect(first.displayName).toBe("Maya Rodriguez");
    expect(second.displayName).toBe("Maya R. Lopez");
    expect(String(fetchMock.mock.calls[1][0])).toBe("/api/claim/tok-child/setup");
  });

  it("sends a second name through the later-edit save", async () => {
    const user = userEvent.setup();
    const saveDisplayName = jest
      .fn<Promise<{ ok: boolean }>, [string]>()
      .mockResolvedValue({ ok: true });

    render(
      <DisplayNameSetupForm
        prompt="How do you want to be seen by this tutor?"
        initialDisplayName="Ada Lovelace"
        saveDisplayName={saveDisplayName}
      />
    );

    await user.click(screen.getByRole("button", { name: "Save display name" }));
    expect(await screen.findByTestId("display-name-saved")).toBeInTheDocument();

    const input = screen.getByLabelText("Display name");
    await user.clear(input);
    await user.type(input, "A. Lovelace");
    await user.click(screen.getByRole("button", { name: "Save display name" }));

    expect(saveDisplayName).toHaveBeenNthCalledWith(1, "Ada Lovelace");
    expect(saveDisplayName).toHaveBeenNthCalledWith(2, "A. Lovelace");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
