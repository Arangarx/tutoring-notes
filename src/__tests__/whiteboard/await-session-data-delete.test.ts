const deleteWhiteboardSessionAndDataActionMock = jest.fn();

jest.mock("@/app/admin/students/[id]/whiteboard/notes-actions", () => ({
  __esModule: true,
  deleteWhiteboardSessionAndDataAction: (...args: unknown[]) =>
    deleteWhiteboardSessionAndDataActionMock(...args),
}));

import { awaitSessionDataDelete } from "@/lib/whiteboard/await-session-data-delete";

const FALLBACK = "Could not delete the session. Please try again.";
const ERR_LINE = "[nsi] wbsid=wb_1 action=delete_uncommitted";
const THROWN_LINE = "[nsi] wbsid=wb_1 action=cancel_pending_failed";

beforeEach(() => {
  deleteWhiteboardSessionAndDataActionMock.mockReset();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("awaitSessionDataDelete", () => {
  it("returns ok and does not log when the action commits", async () => {
    deleteWhiteboardSessionAndDataActionMock.mockResolvedValueOnce({ ok: true });

    await expect(awaitSessionDataDelete("wb_1", FALLBACK, { errLine: ERR_LINE })).resolves.toEqual({
      ok: true,
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("logs the returned error on one line and reports threw false", async () => {
    deleteWhiteboardSessionAndDataActionMock.mockResolvedValueOnce({
      ok: false,
      error: "Database is on fire",
    });

    await expect(awaitSessionDataDelete("wb_1", FALLBACK, { errLine: ERR_LINE })).resolves.toEqual({
      ok: false,
      error: "Database is on fire",
      threw: false,
    });
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "[nsi] wbsid=wb_1 action=delete_uncommitted err=Database is on fire",
    );
  });

  it("logs a thrown Error message and keeps the thrown value", async () => {
    const thrown = new Error("network down");
    deleteWhiteboardSessionAndDataActionMock.mockRejectedValueOnce(thrown);

    await expect(awaitSessionDataDelete("wb_1", FALLBACK, { errLine: ERR_LINE })).resolves.toEqual({
      ok: false,
      error: FALLBACK,
      threw: true,
      thrown,
    });
    expect(console.error).toHaveBeenCalledWith(
      "[nsi] wbsid=wb_1 action=delete_uncommitted err=network down",
    );
  });

  it("stringifies a non-Error throw into the err= line", async () => {
    deleteWhiteboardSessionAndDataActionMock.mockRejectedValueOnce("raw failure");

    await expect(
      awaitSessionDataDelete("wb_1", FALLBACK, { errLine: ERR_LINE }),
    ).resolves.toMatchObject({
      ok: false,
      error: FALLBACK,
      threw: true,
      thrown: "raw failure",
    });
    expect(console.error).toHaveBeenCalledWith(
      "[nsi] wbsid=wb_1 action=delete_uncommitted err=raw failure",
    );
  });

  it("logs a thrown value as the second argument only when the action threw", async () => {
    const thrown = new Error("network down");
    deleteWhiteboardSessionAndDataActionMock.mockRejectedValueOnce(thrown);

    await awaitSessionDataDelete("wb_1", FALLBACK, { thrownLine: THROWN_LINE });
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      "[nsi] wbsid=wb_1 action=cancel_pending_failed",
      thrown,
    );

    (console.error as jest.Mock).mockClear();
    deleteWhiteboardSessionAndDataActionMock.mockResolvedValueOnce({
      ok: false,
      error: "Database is on fire",
    });
    await awaitSessionDataDelete("wb_1", FALLBACK, { thrownLine: THROWN_LINE });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("uses the fallback when the action returns no error string", async () => {
    deleteWhiteboardSessionAndDataActionMock.mockResolvedValueOnce({ ok: false });

    await expect(awaitSessionDataDelete("wb_1", FALLBACK)).resolves.toEqual({
      ok: false,
      error: FALLBACK,
      threw: false,
    });
    expect(console.error).not.toHaveBeenCalled();
  });
});
