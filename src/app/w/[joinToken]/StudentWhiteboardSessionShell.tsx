"use client";

import { WhiteboardSessionShell } from "@/app/admin/students/[id]/whiteboard/[whiteboardSessionId]/workspace/WhiteboardSessionShell";

type Props = {
  whiteboardSessionId: string;
  studentId: string;
  joinToken: string;
  syncUrl: string;
  tutorName: string;
  initialActiveMs: number;
  initialLastActiveAtIso: string | null;
};

/** Thin adapter: student join page props → unified session shell (role=student). */
export function StudentWhiteboardSessionShell(props: Props) {
  return (
    <WhiteboardSessionShell
      role="student"
      whiteboardSessionId={props.whiteboardSessionId}
      studentId={props.studentId}
      joinToken={props.joinToken}
      syncUrl={props.syncUrl}
      tutorName={props.tutorName}
      initialActiveMs={props.initialActiveMs}
      initialLastActiveAtIso={props.initialLastActiveAtIso}
    />
  );
}
