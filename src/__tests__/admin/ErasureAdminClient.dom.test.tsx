/**
 * @jest-environment jsdom
 *
 * ErasureAdminClient — trigger form + cancel dialog button wiring.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouterRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRouterRefresh,
  }),
}));

jest.mock("@/app/admin/erasure/actions", () => ({
  requestErasureByAdminAction: jest.fn(),
  cancelErasureByAdminAction: jest.fn(),
}));

import { ErasureAdminClient } from "@/app/admin/erasure/ErasureAdminClient";
import {
  cancelErasureByAdminAction,
  requestErasureByAdminAction,
} from "@/app/admin/erasure/actions";
import type { ErasureJobListRow } from "@/lib/erasure/list-erasure-jobs";

const requestErasureByAdminActionMock =
  requestErasureByAdminAction as jest.MockedFunction<
    typeof requestErasureByAdminAction
  >;
const cancelErasureByAdminActionMock =
  cancelErasureByAdminAction as jest.MockedFunction<
    typeof cancelErasureByAdminAction
  >;

const learnerProfileId = "11111111-1111-4111-8111-111111111111";
const requestedJobId = "22222222-2222-4222-8222-222222222222";

const requestedJob: ErasureJobListRow = {
  id: requestedJobId,
  scopeKind: "learner_profile",
  scopeId: learnerProfileId,
  scopeLabel: "Test Learner",
  status: "requested",
  requestedAt: new Date("2026-06-01T12:00:00.000Z"),
  purgeEligibleAt: new Date("2026-06-08T12:00:00.000Z"),
  completedAt: null,
  canceledAt: null,
};

beforeEach(() => {
  requestErasureByAdminActionMock.mockReset();
  cancelErasureByAdminActionMock.mockReset();
  mockRouterRefresh.mockReset();
});

describe("ErasureAdminClient — request erasure form", () => {
  test("wrong confirm phrase surfaces server error without success message", async () => {
    const user = userEvent.setup();
    requestErasureByAdminActionMock.mockResolvedValue({
      ok: false,
      error: "Confirmation phrase does not match learner display name",
    });

    render(<ErasureAdminClient initialJobs={[]} />);

    await user.type(
      screen.getByLabelText(/learner profile id/i),
      learnerProfileId
    );
    await user.type(screen.getByLabelText(/confirmation phrase/i), "WRONG");
    await user.click(screen.getByRole("button", { name: /request erasure/i }));

    await waitFor(() =>
      expect(requestErasureByAdminActionMock).toHaveBeenCalledTimes(1)
    );
    expect(requestErasureByAdminActionMock).toHaveBeenCalledWith(
      { kind: "learner_profile", learnerProfileId },
      "WRONG"
    );

    expect(
      screen.getByText(/confirmation phrase does not match/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/erasure requested/i)).not.toBeInTheDocument();
    expect(mockRouterRefresh).not.toHaveBeenCalled();
  });

  test("DELETE confirm phrase calls requestErasureByAdminAction with learner scope", async () => {
    const user = userEvent.setup();
    requestErasureByAdminActionMock.mockResolvedValue({
      ok: true,
      jobId: "job-new-1",
    });

    render(<ErasureAdminClient initialJobs={[]} />);

    await user.type(
      screen.getByLabelText(/learner profile id/i),
      learnerProfileId
    );
    await user.type(screen.getByLabelText(/confirmation phrase/i), "DELETE");
    await user.click(screen.getByRole("button", { name: /request erasure/i }));

    await waitFor(() =>
      expect(requestErasureByAdminActionMock).toHaveBeenCalledTimes(1)
    );
    expect(requestErasureByAdminActionMock).toHaveBeenCalledWith(
      { kind: "learner_profile", learnerProfileId },
      "DELETE"
    );
    expect(screen.getByText(/erasure requested/i)).toBeInTheDocument();
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  test("empty target ID shows validation error and does not call action", async () => {
    const user = userEvent.setup();

    render(<ErasureAdminClient initialJobs={[]} />);

    await user.type(screen.getByLabelText(/confirmation phrase/i), "DELETE");
    await user.click(screen.getByRole("button", { name: /request erasure/i }));

    expect(screen.getByText(/target id is required/i)).toBeInTheDocument();
    expect(requestErasureByAdminActionMock).not.toHaveBeenCalled();
  });
});

describe("ErasureAdminClient — cancel requested job", () => {
  test("confirming cancel dialog calls cancelErasureByAdminAction with job id", async () => {
    const user = userEvent.setup();
    cancelErasureByAdminActionMock.mockResolvedValue({
      ok: true,
      status: "canceled",
    });

    render(<ErasureAdminClient initialJobs={[requestedJob]} />);

    await user.click(screen.getByRole("button", { name: /^cancel erasure$/i }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: /^cancel erasure$/i })
    );

    await waitFor(() =>
      expect(cancelErasureByAdminActionMock).toHaveBeenCalledTimes(1)
    );
    expect(cancelErasureByAdminActionMock).toHaveBeenCalledWith(requestedJobId);
    expect(mockRouterRefresh).toHaveBeenCalled();
  });
});
