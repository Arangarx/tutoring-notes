/**
 * Child tightening of ConsentRestriction. The parent ceiling is the AND of
 * the latest ConsentRecord for each tutor and organization. The child cannot
 * raise a switch, and cannot clear a restriction they (or a parent) set.
 *
 * SERVER-ONLY.
 */

import { db } from "@/lib/db";
import {
  effectiveConsentToggles,
  type ConsentToggleCeiling,
  type ConsentToggleRestriction,
} from "@/lib/consent-scope";

export const CONSENT_SWITCH_KEYS = [
  "allowLiveSession",
  "allowAudioRecording",
  "allowWhiteboardRecording",
  "allowNoteSending",
] as const;

export type ConsentSwitchKey = (typeof CONSENT_SWITCH_KEYS)[number];

const RESTRICT_FIELD = {
  allowLiveSession: "restrictLiveSession",
  allowAudioRecording: "restrictAudioRecording",
  allowWhiteboardRecording: "restrictWhiteboardRecording",
  allowNoteSending: "restrictNoteSending",
} as const;

const RESTORED_FIELD = {
  allowLiveSession: "parentRestoredLiveSession",
  allowAudioRecording: "parentRestoredAudioRecording",
  allowWhiteboardRecording: "parentRestoredWhiteboardRecording",
  allowNoteSending: "parentRestoredNoteSending",
} as const;

const CHILD_SET_FIELD = {
  allowLiveSession: "childSetLiveSession",
  allowAudioRecording: "childSetAudioRecording",
  allowWhiteboardRecording: "childSetWhiteboardRecording",
  allowNoteSending: "childSetNoteSending",
} as const;

export type RestrictionFlags = {
  restrictLiveSession: boolean;
  restrictAudioRecording: boolean;
  restrictWhiteboardRecording: boolean;
  restrictNoteSending: boolean;
};

export type RestoredFlags = {
  parentRestoredLiveSession: boolean;
  parentRestoredAudioRecording: boolean;
  parentRestoredWhiteboardRecording: boolean;
  parentRestoredNoteSending: boolean;
};

export type ChildSetFlags = {
  childSetLiveSession: boolean;
  childSetAudioRecording: boolean;
  childSetWhiteboardRecording: boolean;
  childSetNoteSending: boolean;
};

type RestrictionRow = RestrictionFlags & RestoredFlags & ChildSetFlags;

const ALL_OFF: ConsentToggleCeiling = {
  allowLiveSession: false,
  allowAudioRecording: false,
  allowWhiteboardRecording: false,
  allowNoteSending: false,
};

const NO_RESTRICTION: RestrictionFlags = {
  restrictLiveSession: false,
  restrictAudioRecording: false,
  restrictWhiteboardRecording: false,
  restrictNoteSending: false,
};

const NO_RESTORED: RestoredFlags = {
  parentRestoredLiveSession: false,
  parentRestoredAudioRecording: false,
  parentRestoredWhiteboardRecording: false,
  parentRestoredNoteSending: false,
};

const NO_CHILD_SET: ChildSetFlags = {
  childSetLiveSession: false,
  childSetAudioRecording: false,
  childSetWhiteboardRecording: false,
  childSetNoteSending: false,
};

export type ChildConsentFacing = {
  ceiling: ConsentToggleCeiling;
  effective: ConsentToggleCeiling;
  restoredByParent: ConsentToggleCeiling;
};

type LatestRow = ConsentToggleCeiling & {
  version: number;
  adminUserId: string | null;
  organizationId: string | null;
};

function keepLatest(rows: LatestRow[]): ConsentToggleCeiling[] {
  const byTutor = new Map<string, LatestRow>();
  const byOrg = new Map<string, LatestRow>();
  for (const row of rows) {
    if (row.adminUserId) {
      const prev = byTutor.get(row.adminUserId);
      if (!prev || row.version > prev.version) byTutor.set(row.adminUserId, row);
    } else if (row.organizationId) {
      const prev = byOrg.get(row.organizationId);
      if (!prev || row.version > prev.version) byOrg.set(row.organizationId, row);
    }
  }
  return [...byTutor.values(), ...byOrg.values()].map((row) => ({
    allowLiveSession: row.allowLiveSession,
    allowAudioRecording: row.allowAudioRecording,
    allowWhiteboardRecording: row.allowWhiteboardRecording,
    allowNoteSending: row.allowNoteSending,
  }));
}

function andCeiling(records: ConsentToggleCeiling[]): ConsentToggleCeiling {
  if (records.length === 0) return { ...ALL_OFF };
  return {
    allowLiveSession: records.every((row) => row.allowLiveSession),
    allowAudioRecording: records.every((row) => row.allowAudioRecording),
    allowWhiteboardRecording: records.every((row) => row.allowWhiteboardRecording),
    allowNoteSending: records.every((row) => row.allowNoteSending),
  };
}

function flagsFromRow(row: RestrictionRow | null): RestrictionRow {
  if (!row) return { ...NO_RESTRICTION, ...NO_RESTORED, ...NO_CHILD_SET };
  return {
    restrictLiveSession: row.restrictLiveSession,
    restrictAudioRecording: row.restrictAudioRecording,
    restrictWhiteboardRecording: row.restrictWhiteboardRecording,
    restrictNoteSending: row.restrictNoteSending,
    parentRestoredLiveSession: row.parentRestoredLiveSession,
    parentRestoredAudioRecording: row.parentRestoredAudioRecording,
    parentRestoredWhiteboardRecording: row.parentRestoredWhiteboardRecording,
    parentRestoredNoteSending: row.parentRestoredNoteSending,
    childSetLiveSession: row.childSetLiveSession,
    childSetAudioRecording: row.childSetAudioRecording,
    childSetWhiteboardRecording: row.childSetWhiteboardRecording,
    childSetNoteSending: row.childSetNoteSending,
  };
}

export function restoredFlagsAfterParentSave(
  prev: RestrictionRow | null,
  next: RestrictionFlags
): RestoredFlags & ChildSetFlags {
  const previous = flagsFromRow(prev);
  const restored = { ...NO_RESTORED };
  const childSet = { ...NO_CHILD_SET };
  for (const key of CONSENT_SWITCH_KEYS) {
    const restrictKey = RESTRICT_FIELD[key];
    const restoredKey = RESTORED_FIELD[key];
    const childSetKey = CHILD_SET_FIELD[key];
    if (next[restrictKey]) {
      restored[restoredKey] = false;
      childSet[childSetKey] = previous[childSetKey];
    } else if (previous[restrictKey] && previous[childSetKey]) {
      restored[restoredKey] = true;
      childSet[childSetKey] = false;
    } else if (previous[restrictKey]) {
      restored[restoredKey] = false;
      childSet[childSetKey] = false;
    } else {
      restored[restoredKey] = previous[restoredKey];
      childSet[childSetKey] = previous[childSetKey];
    }
  }
  return { ...restored, ...childSet };
}

export async function readChildConsentFacing(
  learnerProfileId: string
): Promise<ChildConsentFacing> {
  const [records, restriction] = await Promise.all([
    db.consentRecord.findMany({
      where: { learnerProfileId },
      select: {
        version: true,
        adminUserId: true,
        organizationId: true,
        allowLiveSession: true,
        allowAudioRecording: true,
        allowWhiteboardRecording: true,
        allowNoteSending: true,
      },
    }),
    db.consentRestriction.findUnique({ where: { learnerProfileId } }),
  ]);

  const ceiling = andCeiling(keepLatest(records));
  const restrictionInput: ConsentToggleRestriction | null = restriction;
  const effective = effectiveConsentToggles(ceiling, restrictionInput);
  const restoredByParent = { ...ALL_OFF };
  if (restriction) {
    for (const key of CONSENT_SWITCH_KEYS) {
      restoredByParent[key] =
        restriction[RESTORED_FIELD[key]] && effective[key];
    }
  }
  return { ceiling, effective, restoredByParent };
}

export async function applyChildConsentTightening(
  learnerProfileId: string,
  desired: ConsentToggleCeiling
): Promise<{ ok: true } | { ok: false; error: "above_ceiling" | "stricter_only" }> {
  const facing = await readChildConsentFacing(learnerProfileId);

  for (const key of CONSENT_SWITCH_KEYS) {
    if (desired[key] && !facing.ceiling[key]) {
      return { ok: false, error: "above_ceiling" };
    }
  }
  for (const key of CONSENT_SWITCH_KEYS) {
    if (desired[key] && !facing.effective[key]) {
      return { ok: false, error: "stricter_only" };
    }
  }

  const prev = await db.consentRestriction.findUnique({
    where: { learnerProfileId },
  });
  const next = flagsFromRow(prev);

  for (const key of CONSENT_SWITCH_KEYS) {
    if (!desired[key] && facing.effective[key]) {
      next[RESTRICT_FIELD[key]] = true;
      next[RESTORED_FIELD[key]] = false;
      next[CHILD_SET_FIELD[key]] = true;
    }
  }

  await db.consentRestriction.upsert({
    where: { learnerProfileId },
    create: { learnerProfileId, ...next },
    update: next,
  });

  console.log(
    `[cns] lpr=${learnerProfileId} action=child_restriction_set allowLiveSession=${desired.allowLiveSession} allowAudio=${desired.allowAudioRecording} allowWB=${desired.allowWhiteboardRecording} allowNotes=${desired.allowNoteSending}`
  );

  return { ok: true };
}
