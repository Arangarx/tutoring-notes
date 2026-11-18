"use client";

import { useState } from "react";

import { ConsentSwitches, type ConsentSwitchKey } from "@/components/consent/ConsentSwitches";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  CONSENT_SWITCHES,
  NEXT_SESSION_APPLIES_COPY,
  SELF_SWITCH_DESCRIPTION,
} from "@/lib/consent-toggle-copy";
import type { ChildConsentOwner } from "@/lib/child-consent";
import type { ConsentToggleCeiling } from "@/lib/consent-scope";
import { saveChildConsentAction } from "@/app/join/child-home-actions";

const CHILD_DESCRIPTION: Partial<Record<ConsentSwitchKey, string>> = {
  allowLiveSession: SELF_SWITCH_DESCRIPTION.allowLiveSession,
  allowAudioRecording:
    "Session audio can be saved for notes and review. Live conversation still works when live sessions are on.",
};

export function ChildConsentSettings({
  ceiling,
  effective,
  restoredByParent,
  owners = [],
}: {
  ceiling: ConsentToggleCeiling;
  effective: ConsentToggleCeiling;
  restoredByParent: ConsentToggleCeiling;
  owners?: readonly ChildConsentOwner[];
}) {
  const [values, setValues] = useState(effective);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onToggle(key: ConsentSwitchKey, checked: boolean) {
    if (checked && !ceiling[key]) {
      setError("A parent has this turned off. You can only make a switch stricter.");
      return;
    }
    const next = { ...values, [key]: checked };
    setBusy(true);
    setError(null);
    const result = await saveChildConsentAction(next);
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error === "above_ceiling"
          ? "A parent has this turned off. You can only make a switch stricter."
          : result.error === "stricter_only"
            ? "Only a parent can turn this back on."
            : "Session expired. Sign in again and try once more."
      );
      return;
    }
    setValues(next);
  }

  const switches = CONSENT_SWITCHES.map((item) => ({
    key: item.key,
    label: item.label,
    description: CHILD_DESCRIPTION[item.key] ?? item.description,
    emphasis: item.emphasis,
    banner: "banner" in item ? item.banner : undefined,
    notice: restoredByParent[item.key]
      ? "Your parent turned this back on."
      : "notice" in item
        ? item.notice
        : undefined,
  }));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        You can turn any of these off. A parent can turn one back on.
      </p>
      {owners.length > 0 ? (
        <ul className="space-y-2">
          {owners.map((owner) => (
            <li key={owner.key} data-testid="child-consent-owner" className="text-sm">
              <p className="font-medium text-foreground">{owner.label}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <ConsentSwitches
        idPrefix="child"
        testIdPrefix="child-consent"
        switches={switches}
        values={values}
        onToggle={(key, checked) => {
          if (!busy) void onToggle(key, checked);
        }}
      />
      <p className="text-sm text-muted-foreground" data-testid="consent-next-session">
        {NEXT_SESSION_APPLIES_COPY}
      </p>
      {error ? (
        <Alert className="rounded-[10px] border-destructive/30" role="alert">
          <AlertTitle>Could not update</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
