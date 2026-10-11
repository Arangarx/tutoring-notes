"use client";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type ConsentSwitchKey =
  | "allowLiveSession"
  | "allowAudioRecording"
  | "allowWhiteboardRecording"
  | "allowNoteSending";

export type ConsentSwitchDef = {
  key: ConsentSwitchKey;
  label: string;
  description: string;
  emphasis?: "critical" | "recommended" | "standard";
  /** Extra line above the switch. The live-session scheduling sentence uses this. */
  banner?: string;
  /** Extra line under the description. The recommended keep-on sentence uses this. */
  notice?: string;
};

/**
 * The four consent switches. Parent rows and self-learner settings both use this.
 * Copy and which switches appear are inputs.
 */
export function ConsentSwitches({
  idPrefix,
  switches,
  values,
  onToggle,
  testIdPrefix = "consent-switch",
}: {
  idPrefix: string;
  switches: readonly ConsentSwitchDef[];
  values: Record<ConsentSwitchKey, boolean>;
  onToggle: (key: ConsentSwitchKey, checked: boolean) => void;
  testIdPrefix?: string;
}) {
  return (
    <div className="space-y-3">
      {switches.map((item) => {
        const inputId = `${idPrefix}-${item.key}`;
        const liveSessionsOff = item.emphasis === "critical" && !values.allowLiveSession;
        return (
          <div
            key={item.key}
            className={cn(
              "rounded-[10px] border bg-background p-3",
              liveSessionsOff
                ? "border-warning/30"
                : item.emphasis === "recommended"
                  ? "border-accent/30 bg-accent-soft/20"
                  : "border-border"
            )}
          >
            {item.banner && liveSessionsOff ? (
              <p className="mb-3 text-xs text-foreground">{item.banner}</p>
            ) : null}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Label
                    htmlFor={inputId}
                    className={cn(
                      "cursor-pointer",
                      item.emphasis === "critical" ? "text-base font-semibold" : "text-sm font-medium"
                    )}
                  >
                    {item.label}
                  </Label>
                  {item.emphasis === "recommended" ? (
                    <Badge className="bg-accent-soft font-mono text-[10px] uppercase text-accent-text">
                      Recommended
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">{item.description}</p>
                {item.notice ? (
                  <p className="text-xs text-foreground">{item.notice}</p>
                ) : null}
              </div>
              <Switch
                id={inputId}
                data-testid={
                  idPrefix
                    ? `${testIdPrefix}-${idPrefix}-${item.key}`
                    : `${testIdPrefix}-${item.key}`
                }
                checked={values[item.key]}
                onCheckedChange={(checked) => onToggle(item.key, checked === true)}
                aria-label={item.label}
                className="shrink-0"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
