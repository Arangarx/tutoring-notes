import type { Prisma } from "@prisma/client";

/**
 * Parent `/s/[token]` surfaces must load the same recording + whiteboard
 * relation shape as `/admin/students/[id]/notes` so "Watch the whiteboard
 * recording" matches the tutor view. Exported for both `include` (main share
 * index) and `select` (`/s/[token]/all` paginated list).
 */
export const parentShareRecordingsArgs = {
  orderBy: { orderIndex: "asc" as const },
  select: {
    id: true,
    mimeType: true,
    durationSeconds: true,
    orderIndex: true,
    whiteboardSessionId: true,
  },
} satisfies Prisma.SessionRecordingFindManyArgs;

export const parentShareWhiteboardSessionsArgs = {
  orderBy: { startedAt: "desc" as const },
  select: { id: true },
} satisfies Prisma.WhiteboardSessionFindManyArgs;

export const parentShareNoteInclude = {
  recordings: parentShareRecordingsArgs,
  whiteboardSessions: parentShareWhiteboardSessionsArgs,
} satisfies Prisma.SessionNoteInclude;
