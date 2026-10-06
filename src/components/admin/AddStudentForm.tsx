"use client";

import { useActionState, useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { Button } from "@/components/ui/button";
import {
  createStudent,
  retryStudentClaimInvite,
  type CreateStudentResult,
} from "@/app/admin/students/actions";
import {
  SITE_ROLE_CHILD_LEARNER,
  SITE_ROLE_SELF_LEARNER_PARENT,
} from "@/lib/site-role-labels";

const initialCreateState: CreateStudentResult | null = null;

export function AddStudentForm({ idPrefix = "" }: { idPrefix?: string }) {
  const [learnerKind, setLearnerKind] = useState<"self_learner" | "child_learner">(
    "child_learner"
  );
  const [createState, createAction, createPending] = useActionState(
    createStudent,
    initialCreateState
  );
  const [retryState, retryAction, retryPending] = useActionState(
    retryStudentClaimInvite,
    null
  );

  useEffect(() => {
    if (createState?.status === "success") {
      setLearnerKind("child_learner");
    }
  }, [createState]);

  const inviteFailed =
    createState?.status === "invite_send_failed" ? createState : null;

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Learner type</legend>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name={`${idPrefix}learnerKindChoice`}
            checked={learnerKind === "self_learner"}
            onChange={() => setLearnerKind("self_learner")}
            className="size-4 accent-brand"
          />
          {SITE_ROLE_SELF_LEARNER_PARENT}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name={`${idPrefix}learnerKindChoice`}
            checked={learnerKind === "child_learner"}
            onChange={() => setLearnerKind("child_learner")}
            className="size-4 accent-brand"
          />
          {SITE_ROLE_CHILD_LEARNER}
        </label>
      </fieldset>

      <form action={createAction} className="flex flex-col gap-4">
        <input type="hidden" name="learnerKind" value={learnerKind} />

        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}inviteEmail`}>
            {learnerKind === "self_learner"
              ? "Self learner email"
              : "Parent / guardian email"}
          </Label>
          <Input
            id={`${idPrefix}inviteEmail`}
            name="inviteEmail"
            type="email"
            required
            autoComplete="email"
            className="min-h-11"
            placeholder={
              learnerKind === "self_learner" ? "adult@example.com" : "parent@example.com"
            }
          />
          {learnerKind === "self_learner" ? (
            <p className="text-xs text-muted-foreground">
              They sign in with this email and a password — no child PIN.
            </p>
          ) : null}
        </div>

        {learnerKind === "child_learner" ? (
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}childIdentifier`}>Child identifier</Label>
            <Input
              id={`${idPrefix}childIdentifier`}
              name="childIdentifier"
              required
              className="min-h-11"
              placeholder="First name or username@familyid"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Until they approve the connection, you will see this identifier (or their email
              handle) — not their full display name.
            </p>
          </div>
        ) : null}

        {createState?.status === "error" ? (
          <p className="text-sm text-destructive" role="alert">
            {createState.message}
          </p>
        ) : null}

        {createState?.status === "success" ? (
          <p className="text-sm text-green-700 dark:text-green-400" role="status">
            Invitation sent. They can approve the connection from their email.
          </p>
        ) : null}

        {inviteFailed ? (
          <div
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
            role="alert"
          >
            <p>{inviteFailed.message}</p>
            <form action={retryAction} className="mt-3">
              <input type="hidden" name="studentId" value={inviteFailed.studentId} />
              <Button type="submit" variant="outline" size="sm" disabled={retryPending}>
                {retryPending ? "Retrying…" : "Retry invitation email"}
              </Button>
            </form>
            {retryState?.status === "success" ? (
              <p className="mt-2 text-green-700 dark:text-green-400">Invitation sent.</p>
            ) : null}
            {retryState?.status === "invite_send_failed" || retryState?.status === "error" ? (
              <p className="mt-2 text-destructive">{retryState.message}</p>
            ) : null}
          </div>
        ) : null}

        <FormSubmitButton
          label="Add learner & send invite"
          pendingLabel="Sending invite…"
          variant="accent"
          className="sm:min-w-[180px]"
          disabled={createPending}
        />
      </form>
    </div>
  );
}
