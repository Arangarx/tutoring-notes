"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelErasureByAdminAction,
  requestErasureByAdminAction,
} from "./actions";
import type { ErasureJobListRow } from "@/lib/erasure/list-erasure-jobs";
import { SectionCard } from "@/components/SectionCard";
import { ErasureGraceCountdown } from "@/components/admin/ErasureGraceCountdown";
import { LocalDateTimeText } from "@/components/LocalDateTimeText";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

type ScopeMode = "learner_profile" | "account_holder";

type ErasureAdminClientProps = {
  initialJobs: ErasureJobListRow[];
};

function scopeKindLabel(kind: ErasureJobListRow["scopeKind"]): string {
  return kind === "learner_profile" ? "Per learner" : "Full family";
}

function statusLabel(status: ErasureJobListRow["status"]): string {
  switch (status) {
    case "requested":
      return "Grace period";
    case "blobs_purging":
      return "Purging blobs";
    case "db_scrubbing":
      return "Scrubbing database";
    case "completed":
      return "Completed";
    case "canceled":
      return "Canceled";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function statusClass(status: ErasureJobListRow["status"]): string {
  switch (status) {
    case "requested":
      return "text-warning";
    case "blobs_purging":
    case "db_scrubbing":
      return "text-accent-text";
    case "completed":
      return "text-muted-foreground";
    case "canceled":
      return "text-muted-foreground";
    case "failed":
      return "text-destructive";
    default:
      return "";
  }
}

function CancelJobButton({ jobId }: { jobId: string }) {
  const cancelTestId = `erasure-job-cancel-${jobId}`;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelErasureByAdminAction(jobId);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            data-testid={cancelTestId}
          >
            Cancel erasure
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent data-testid={`erasure-cancel-dialog-${jobId}`}>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel erasure and restore account?</AlertDialogTitle>
            <AlertDialogDescription>
              This cancels the pending deletion and fully restores login and
              access. The learner&apos;s data and identity remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={isPending}
              data-testid="erasure-cancel-dialog-dismiss"
            >
              Keep erasure
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              data-testid="erasure-cancel-dialog-confirm"
              onClick={(e) => {
                e.preventDefault();
                handleCancel();
              }}
            >
              {isPending ? "Canceling…" : "Cancel erasure"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? <p className="max-w-[14rem] text-right text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function ErasureAdminClient({ initialJobs }: ErasureAdminClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [scopeMode, setScopeMode] = useState<ScopeMode>("learner_profile");
  const [targetId, setTargetId] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerSuccess, setTriggerSuccess] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTriggerError(null);
    setTriggerSuccess(null);

    const trimmedId = targetId.trim();
    if (!trimmedId) {
      setTriggerError("Target ID is required.");
      return;
    }
    if (!confirmPhrase.trim()) {
      setTriggerError("Confirmation phrase is required.");
      return;
    }

    const scope =
      scopeMode === "learner_profile"
        ? { kind: "learner_profile" as const, learnerProfileId: trimmedId }
        : { kind: "account_holder" as const, accountHolderId: trimmedId };

    startTransition(async () => {
      const result = await requestErasureByAdminAction(scope, confirmPhrase.trim());
      if (result.ok) {
        setTriggerSuccess(`Erasure requested. Job ID: ${result.jobId}`);
        setTargetId("");
        setConfirmPhrase("");
        router.refresh();
      } else {
        setTriggerError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Alert variant="destructive" className="border-destructive/40">
        <AlertTitle>Permanent data destruction</AlertTitle>
        <AlertDescription>
          <p>
            Requesting erasure <strong>deactivates the account immediately</strong>{" "}
            (login disabled; tutor and family access suspended). After a{" "}
            <strong>7-day grace period</strong>, learner and family content is
            permanently destroyed: session notes, transcripts, audio recordings,
            whiteboard data, and every associated file.
          </p>
          <p className="mt-2">
            <strong>Canceling during grace fully restores the account</strong> —
            login, access, and identity are recovered. De-identified billing
            metadata (session durations, cost events, consent audit rows) is
            retained for compliance even after a completed erasure.
          </p>
          <p className="mt-2 text-muted-foreground">
            Tell the family: account deactivated immediately; permanently deleted
            in 7 days; contact us to cancel within that window.
          </p>
        </AlertDescription>
      </Alert>

      <SectionCard realm="admin"
        title="Request erasure"
        description="Operator-only. Use for verified parental erasure requests. Tutors see a “Pending erasure” badge on the student roster during grace — not a deleted placeholder until purge completes."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="erasure-scope">Scope</Label>
              <Select
                value={scopeMode}
                onValueChange={(v) => setScopeMode(v as ScopeMode)}
              >
                <SelectTrigger
                  id="erasure-scope"
                  className="w-full"
                  data-testid="erasure-scope-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="learner_profile">Per learner</SelectItem>
                  <SelectItem value="account_holder">Full family</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="erasure-target-id">
                {scopeMode === "learner_profile"
                  ? "Learner profile ID"
                  : "Account holder ID"}
              </Label>
              <Input
                id="erasure-target-id"
                data-testid="erasure-target-input"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="UUID"
                className="font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
              {scopeMode === "account_holder" ? (
                <p className="text-xs text-muted-foreground">
                  Full-family erasure: enter the parent&apos;s{" "}
                  <strong>Account holder ID</strong>, not a learner profile ID.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="erasure-confirm">
              Confirmation phrase
            </Label>
            <Input
              id="erasure-confirm"
              data-testid="erasure-confirm-input"
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              placeholder={
                scopeMode === "learner_profile"
                  ? "Exact learner display name or DELETE"
                  : "Exact account holder display name or DELETE"
              }
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Type the target&apos;s current display name exactly, or{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">DELETE</code>{" "}
              to confirm without the name on file.
            </p>
          </div>

          {triggerError ? (
            <p
              className="text-sm text-destructive"
              role="alert"
              data-testid="erasure-error-alert"
            >
              {triggerError}
            </p>
          ) : null}
          {triggerSuccess ? (
            <p
              className="text-sm text-green-600 dark:text-green-400"
              role="status"
              data-testid="erasure-success-status"
            >
              {triggerSuccess}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="destructive"
            disabled={isPending}
            data-testid="erasure-submit-btn"
          >
            {isPending ? "Requesting…" : "Request erasure"}
          </Button>
        </form>
      </SectionCard>

      <SectionCard realm="admin" title="Erasure jobs" contentClassName="p-0">
        {initialJobs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No erasure jobs yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Grace / purge</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialJobs.map((job) => (
                <TableRow key={job.id} data-testid={`erasure-job-row-${job.id}`}>
                  <TableCell className="align-top">
                    <p className="text-sm font-medium text-foreground">
                      {scopeKindLabel(job.scopeKind)}
                      {job.scopeLabel ? ` — ${job.scopeLabel}` : ""}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {job.scopeId}
                    </p>
                  </TableCell>
                  <TableCell
                    className={cn("align-top text-sm font-medium", statusClass(job.status))}
                    data-testid={`erasure-job-status-${job.id}`}
                  >
                    {statusLabel(job.status)}
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    <LocalDateTimeText dateTime={job.requestedAt.toISOString()} />
                  </TableCell>
                  <TableCell className="align-top text-sm">
                    {job.status === "requested" ? (
                      <div className="space-y-1">
                        <ErasureGraceCountdown
                          purgeEligibleAt={job.purgeEligibleAt.toISOString()}
                          className="text-xs text-muted-foreground"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Purge after{" "}
                          <LocalDateTimeText dateTime={job.purgeEligibleAt.toISOString()} />
                        </p>
                      </div>
                    ) : job.status === "completed" && job.completedAt ? (
                      <LocalDateTimeText dateTime={job.completedAt.toISOString()} />
                    ) : job.status === "canceled" && job.canceledAt ? (
                      <span className="text-muted-foreground">
                        Canceled{" "}
                        <LocalDateTimeText dateTime={job.canceledAt.toISOString()} />
                      </span>
                    ) : (
                      <LocalDateTimeText dateTime={job.purgeEligibleAt.toISOString()} />
                    )}
                  </TableCell>
                  <TableCell className="align-top text-right">
                    {job.status === "requested" ? (
                      <CancelJobButton jobId={job.id} />
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}
