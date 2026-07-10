"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth-options";
import { db, withDbRetry, isTransientDbConnectionError } from "@/lib/db";
import { getAdminByEmail } from "@/lib/auth-db";
import { sendMail } from "@/lib/email";
import { generateShareToken, parseLinksFromTextarea } from "@/lib/security";
import { assertOwnsMutableStudent, assertOwnsStudent, getStudentScope, requireStudentScope } from "@/lib/student-scope";
import { generateSessionNote, estimateTokens, MAX_INPUT_TOKENS } from "@/lib/ai";
import { parseDateOnlyInput } from "@/lib/date-only";
import { mapWithConcurrency, transcribeAudio } from "@/lib/transcribe";
import { getAudioUrl, getBlobMetadata, deleteBlob } from "@/lib/blob";
import {
  buildTranscribeAndGenerateResult,
  FRIENDLY_TRANSCRIPTION_TIMEOUT_MESSAGE,
  shouldTreatAsTranscriptionTimeout,
  type TranscribeAndGenerateResult,
} from "./transcribe-result";
import { createActionCorrelationId } from "@/lib/action-correlation";
import { revalidateStudentSharePages } from "@/lib/revalidateStudentSharePages";
import { looksLikeSilenceHallucination } from "@/lib/whisper-guardrails";
import { assertTutorApproved } from "@/lib/tutor-approval-scope";

const HALLUCINATION_MIC_MESSAGE =
  "We couldn't detect clear speech in this recording. Whisper sometimes invents text when the mic picks up silence or the wrong device. Check the browser's microphone permission, choose the correct input, speak for at least 15–20 seconds, then try again. You can also use Upload and pick a file from another recorder.";

const TRANSCRIPT_OUTER_CONCURRENCY = 3;

// Re-export for callers that still import the type from this module.
export type { TranscribeAndGenerateResult };

function baseUrl() {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

/**
 * Combine a date string ("YYYY-MM-DD") and a time string ("HH:MM") into a UTC Date.
 * Returns null if either is missing or the result is invalid.
 */
function parseTimeOnDate(dateStr: string, timeStr: string): Date | null {
  if (!timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function signerFromSessionEmail(email: string | null | undefined): string {
  if (!email) return "Your tutor";
  const local = email.split("@")[0] ?? "";
  const words = local.replace(/[._-]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "Your tutor";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

async function resolveTutorDisplayName(): Promise<{ signer: string; fromDisplayName: string }> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  const admin = email ? await getAdminByEmail(email) : null;
  const fromDb = admin?.displayName?.trim();
  const signer = fromDb || signerFromSessionEmail(email);
  return { signer, fromDisplayName: signer };
}

export async function regenerateShareLink(studentId: string) {
  await assertOwnsMutableStudent(studentId);
  await db.shareLink.updateMany({
    where: { studentId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await db.shareLink.create({
    data: { studentId, token: generateShareToken() },
  });

  revalidatePath(`/admin/students/${studentId}`);
}

export async function revokeShareLink(studentId: string) {
  await assertOwnsMutableStudent(studentId);
  await db.shareLink.updateMany({
    where: { studentId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  revalidatePath(`/admin/students/${studentId}`);
}

export async function createNote(
  studentId: string,
  formData: FormData
): Promise<{ id: string }> {
  await assertOwnsMutableStudent(studentId);
  const dateStr = String(formData.get("date") ?? "");
  const date = parseDateOnlyInput(dateStr);
  if (!date) throw new Error("Invalid date");

  const template = String(formData.get("template") ?? "").trim() || null;
  const topics = String(formData.get("topics") ?? "").trim();
  const homework = String(formData.get("homework") ?? "").trim();
  const assessment = String(formData.get("assessment") ?? "").trim();
  // Form field name is "plan" (UI label "Plan", new in B4). DB column is
  // still `nextSteps` so we don't need a data migration — see schema.prisma.
  // Accept the legacy `nextSteps` form key too in case anything still posts it.
  const planFromForm = String(formData.get("plan") ?? "").trim();
  const nextSteps = planFromForm || String(formData.get("nextSteps") ?? "").trim();
  const linksText = String(formData.get("links") ?? "");
  const aiGenerated = formData.get("aiGenerated") === "true";
  const aiPromptVersion = aiGenerated
    ? String(formData.get("aiPromptVersion") ?? "").trim() || null
    : null;
  const recordingIds = formData
    .getAll("recordingId")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const shareRecordingInEmail = formData.get("shareRecordingInEmail") === "true";

  // Parse optional session times (HH:MM from <input type="time">).
  const startTimeStr = String(formData.get("startTime") ?? "").trim();
  const endTimeStr = String(formData.get("endTime") ?? "").trim();
  // Browser's getTimezoneOffset(): minutes west of UTC (positive = behind UTC, e.g. CDT = 360).
  const tzOffsetMinutes = parseInt(String(formData.get("timezoneOffsetMinutes") ?? "0"), 10) || 0;
  let startTime = parseTimeOnDate(dateStr, startTimeStr);
  let endTime = parseTimeOnDate(dateStr, endTimeStr);

  const links = parseLinksFromTextarea(linksText);

  // Verify every supplied recording belongs to this student before linking.
  if (recordingIds.length > 0) {
    const recordings = await db.sessionRecording.findMany({
      where: { id: { in: recordingIds } },
      select: { id: true, studentId: true },
    });
    for (const rec of recordings) {
      if (rec.studentId !== studentId) {
        throw new Error("Recording not found or access denied");
      }
    }
    if (recordings.length !== recordingIds.length) {
      throw new Error("One or more recordings not found");
    }
  }

  const note = await db.sessionNote.create({
    data: {
      studentId,
      date,
      template,
      topics,
      homework,
      assessment,
      nextSteps,
      linksJson: JSON.stringify(links),
      status: "DRAFT",
      aiGenerated,
      aiPromptVersion,
      shareRecordingInEmail: recordingIds.length > 0 ? shareRecordingInEmail : false,
      startTime,
      endTime,
    },
  });

  // Link all recordings to this note, assigning order by the sequence they were provided.
  if (recordingIds.length > 0) {
    await Promise.all(
      recordingIds.map((id, i) =>
        db.sessionRecording.update({
          where: { id },
          data: { noteId: note.id, orderIndex: i },
        })
      )
    );

    const wbFromRecordings = await withDbRetry(
      () =>
        db.sessionRecording.findMany({
          where: { id: { in: recordingIds } },
          select: { whiteboardSessionId: true },
        }),
      { label: "createNote.whiteboardIdsFromRecordings" }
    );
    const wbIds = [
      ...new Set(
        wbFromRecordings
          .map((r) => r.whiteboardSessionId)
          .filter((x): x is string => typeof x === "string" && x.length > 0)
      ),
    ];
    if (wbIds.length > 0) {
      await withDbRetry(
        () =>
          db.whiteboardSession.updateMany({
            where: { id: { in: wbIds } },
            data: { noteId: note.id },
          }),
        { label: "createNote.linkWhiteboardsFromRecordings" }
      );
    }

    // Auto-fill missing times from recording timestamps when the tutor left them blank.
    if (!startTime || !endTime) {
      const recs = await db.sessionRecording.findMany({
        where: { id: { in: recordingIds } },
        orderBy: { orderIndex: "asc" },
        select: { createdAt: true, durationSeconds: true },
      });
      if (recs.length > 0) {
        if (!startTime) {
          const firstDuration = recs[0].durationSeconds ?? 0;
          // Convert UTC recording timestamp to local by subtracting the browser's tz offset.
          const rawStart = recs[0].createdAt.getTime() - firstDuration * 1000;
          startTime = new Date(rawStart - tzOffsetMinutes * 60 * 1000);
        }
        if (!endTime) {
          endTime = new Date(recs[recs.length - 1].createdAt.getTime() - tzOffsetMinutes * 60 * 1000);
        }
        await db.sessionNote.update({
          where: { id: note.id },
          data: { startTime, endTime },
        });
      }
    }
  }

  revalidatePath(`/admin/students/${studentId}`);
  if (recordingIds.length > 0 || shareRecordingInEmail) {
    await revalidateStudentSharePages(studentId);
  }
  return { id: note.id };
}

// ---------------------------------------------------------------------------
// AI: generate structured note from freeform session text
// ---------------------------------------------------------------------------

export type GenerateNoteResult =
  | {
      ok: true;
      topics: string;
      homework: string;
      assessment: string;
      /** UI-facing name; persisted to the legacy `nextSteps` DB column. */
      plan: string;
      links: string;
      promptVersion: string;
    }
  | { ok: false; error: string };

export async function generateNoteFromTextAction(
  studentId: string,
  sessionText: string
): Promise<GenerateNoteResult> {
  await assertOwnsMutableStudent(studentId);
  const scope = await getStudentScope();
  const adminUserId = scope.kind === "admin" ? scope.adminId : null;

  // B1 cost gate: WAITLISTED tutors cannot use AI note generation (OpenAI spend).
  if (adminUserId) {
    await assertTutorApproved(adminUserId);
  }

  const trimmed = sessionText.trim();
  if (!trimmed) return { ok: false, error: "Please enter some session text first." };
  if (estimateTokens(trimmed) > MAX_INPUT_TOKENS) {
    return { ok: false, error: "Session text is too long. Please shorten it and try again." };
  }

  const student = await db.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { name: true },
  });

  const recentNotes = await db.sessionNote.findMany({
    where: { studentId },
    orderBy: { date: "desc" },
    take: 2,
    select: { date: true, topics: true, nextSteps: true, template: true },
  });

  // Use the most recent note's template as context if available.
  const template = recentNotes[0]?.template ?? null;

  const result = await generateSessionNote({
    studentName: student.name,
    sessionText: trimmed,
    recentNotes: recentNotes.map((n) => ({
      date: n.date,
      topics: n.topics,
      // DB column is `nextSteps`; the AI input field is named `plan` (UI label).
      plan: n.nextSteps,
    })),
    template,
    costProvenance: { adminUserId, studentId },
  });

  if ("error" in result) {
    if (result.error === "not configured") {
      return { ok: false, error: "AI generation is not configured on this server." };
    }
    return { ok: false, error: result.error };
  }

  return {
    ok: true,
    topics: result.topics,
    homework: result.homework,
    assessment: result.assessment,
    plan: result.plan,
    links: result.links,
    promptVersion: result.promptVersion,
  };
}

// ---------------------------------------------------------------------------
// AI: transcribe audio recording and generate structured note
// ---------------------------------------------------------------------------

// Type + helper now live in `./transcribe-result` so they can be exported
// from a non-server module (Next.js requires every export from a "use server"
// file to be an async server action). See that file for the full contract.

/**
 * Given one or more Vercel Blob URLs for uploaded audio recordings (segments):
 * 1. Verifies tutor owns the student (multi-tenant guard).
 * 2. Creates a SessionRecording row per segment.
 * 3. Downloads each audio segment and transcribes via Whisper.
 * 4. Updates each recording row with its transcript + duration.
 * 5. Concatenates all transcripts (in order) and runs generateSessionNote once.
 * 6. Returns the recording IDs + generated note fields.
 *
 * For backwards compatibility, a single recording can still be passed as
 * a plain blobUrl + mimeType pair (the old signature) or as an array.
 */
export async function transcribeAndGenerateAction(
  studentId: string,
  recordings: Array<{ blobUrl: string; mimeType: string }>
): Promise<TranscribeAndGenerateResult> {
  const rid = createActionCorrelationId();
  const actionStartedMs = performance.now();
  console.log(
    `[transcribeAndGenerateAction] rid=${rid} studentId=${studentId} segments=${recordings.length} begin`
  );
  try {
    const out = await _transcribeAndGenerateImpl(studentId, recordings, rid);
    if (out.ok) {
      console.log(`[transcribeAndGenerateAction] rid=${rid} ok recordingIds=${out.recordingIds.length}`);
    } else {
      console.warn(`[transcribeAndGenerateAction] rid=${rid} returned ok:false`, out.error);
    }
    return out;
  } catch (err) {
    const elapsedMs = performance.now() - actionStartedMs;
    if (shouldTreatAsTranscriptionTimeout(err, elapsedMs)) {
      console.error(
        `[transcribeAndGenerateAction] rid=${rid} invocation budget exceeded (elapsedMs=${Math.round(elapsedMs)})`
      );
      return {
        ok: false,
        error: FRIENDLY_TRANSCRIPTION_TIMEOUT_MESSAGE,
        debugId: rid,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[transcribeAndGenerateAction] rid=${rid} thrown:`, msg);
    if (isTransientDbConnectionError(err)) {
      return {
        ok: false,
        error:
          "Brief database hiccup during transcription. Your recording is saved — please click Transcribe & generate notes again.",
        debugId: rid,
      };
    }
    return {
      ok: false,
      error: `Server error during transcription: ${msg}. Please try again.`,
      debugId: rid,
    };
  }
}

function transcribeFail(rid: string, error: string): TranscribeAndGenerateResult {
  return { ok: false, error, debugId: rid };
}

async function _transcribeAndGenerateImpl(
  studentId: string,
  recordings: Array<{ blobUrl: string; mimeType: string }>,
  rid: string
): Promise<TranscribeAndGenerateResult> {
  const scope = await requireStudentScope();
  if (scope.kind !== "admin") {
    return transcribeFail(rid, "Audio features require a DB-backed tutor account.");
  }
  const tutorAdminId = scope.adminId;
  await assertOwnsMutableStudent(studentId);

  // B1 cost gate: WAITLISTED tutors cannot run transcription (Whisper + OpenAI spend).
  await assertTutorApproved(tutorAdminId);

  if (recordings.length === 0) {
    return transcribeFail(rid, "No recordings provided.");
  }

  // Validate all URLs look like Vercel Blob URLs (defence in depth).
  for (const rec of recordings) {
    if (!rec.blobUrl.includes("blob.vercel-storage.com")) {
      return transcribeFail(rid, "Invalid audio URL.");
    }
  }

  const MIME_TO_EXT: Record<string, string> = {
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/mpga": "mp3",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/oga": "oga",
    "audio/wav": "wav",
    "audio/flac": "flac",
  };

  console.log(
    `[transcribe-parallel] rid=${rid} outer-cap=${TRANSCRIPT_OUTER_CONCURRENCY} segments=${recordings.length} mode=parallel`
  );

  type SegmentOutcome =
    | { kind: "fatal"; index: number; result: TranscribeAndGenerateResult }
    | { kind: "skipped"; index: number }
    | {
        kind: "kept";
        index: number;
        transcript: string;
        recordingId: string;
        createdAt: Date;
        durationSeconds: number | null;
      };

  async function processSegment(i: number): Promise<SegmentOutcome> {
    const { blobUrl, mimeType } = recordings[i];

    // Get metadata from Vercel Blob. Retry once after a short pause to absorb
    // transient Vercel Blob CDN hiccups (the same retry pattern we use for
    // Neon cold starts, just lighter — blob fetches are usually fast).
    let sizeBytes: number;
    let resolvedMimeType: string;
    try {
      let meta;
      try {
        meta = await getBlobMetadata(blobUrl);
      } catch (firstErr) {
        const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        console.warn(
          `[transcribeAndGenerate] rid=${rid} getBlobMetadata first attempt failed; retrying once:`,
          firstMsg
        );
        await new Promise((r) => setTimeout(r, 500));
        meta = await getBlobMetadata(blobUrl);
      }
      sizeBytes = meta.size;
      resolvedMimeType = meta.contentType || mimeType;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[transcribeAndGenerate] rid=${rid} getBlobMetadata failed twice:`, msg);
      return {
        kind: "fatal",
        index: i,
        result: transcribeFail(
          rid,
          `Could not reach audio file${recordings.length > 1 ? ` (segment ${i + 1})` : ""}. Please try uploading again.`
        ),
      };
    }

    // Create the recording row early so we have its ID even if transcription fails.
    // We push to `createdRecordingIds` only after the per-segment guards pass, so the
    // returned list reflects only segments we actually used (a skipped silent segment
    // gets its row deleted below and stays out of the list).
    const recording = await withDbRetry(
      () =>
        db.sessionRecording.create({
          data: {
            adminUserId: tutorAdminId,
            studentId,
            blobUrl,
            mimeType: resolvedMimeType,
            sizeBytes,
            orderIndex: i,
          },
        }),
      { label: "createSessionRecording" }
    );

    // Download audio bytes — private blob requires Bearer token.
    let audioBuffer: Buffer;
    try {
      const res = await fetch(blobUrl, {
        headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN ?? ""}` },
      });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
      audioBuffer = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      // Clean up just this blob + DB row; already-transcribed segments are kept.
      await deleteBlob(blobUrl).catch(() => undefined);
      await withDbRetry(
        () => db.sessionRecording.delete({ where: { id: recording.id } }),
        { label: "deleteSessionRecording" }
      ).catch(() => undefined);
      const msg = err instanceof Error ? err.message : String(err);
      const cause = err instanceof Error && (err as Error & { cause?: unknown }).cause;
      console.error(`[transcribeAndGenerate] rid=${rid} download failed:`, msg, cause ? `cause=${String(cause)}` : "");
      return {
        kind: "fatal",
        index: i,
        result: transcribeFail(
          rid,
          `Could not download audio for transcription${recordings.length > 1 ? ` (segment ${i + 1})` : ""}. Please try again.`
        ),
      };
    }

    // Transcribe via Whisper.
    const baseMime = resolvedMimeType.split(";")[0].trim().toLowerCase();
    const ext = MIME_TO_EXT[baseMime] ?? baseMime.split("/")[1]?.split(";")[0] ?? "webm";
    const filename = `session-${studentId}-part${i + 1}.${ext}`;
    const transcribeResult = await transcribeAudio(
      audioBuffer,
      filename,
      resolvedMimeType,
      {
        adminUserId: tutorAdminId,
        studentId,
        sessionRecordingId: recording.id,
      },
      { rid }
    );

    if ("error" in transcribeResult) {
      if (transcribeResult.error === "not configured") {
        return {
          kind: "fatal",
          index: i,
          result: transcribeFail(rid, "AI transcription is not configured on this server."),
        };
      }
      return { kind: "fatal", index: i, result: transcribeFail(rid, transcribeResult.error) };
    }

    if (
      looksLikeSilenceHallucination(transcribeResult.transcript, transcribeResult.durationSeconds)
    ) {
      console.warn(
        `[transcribeAndGenerate] rid=${rid} likely silence/mic hallucination — skipping segment`,
        JSON.stringify({
          segment: i + 1,
          totalSegments: recordings.length,
          transcriptChars: transcribeResult.transcript.length,
          durationSeconds: transcribeResult.durationSeconds,
        })
      );
      await deleteBlob(blobUrl).catch(() => undefined);
      await withDbRetry(
        () => db.sessionRecording.delete({ where: { id: recording.id } }),
        { label: "deleteSessionRecordingHallucination" }
      ).catch(() => undefined);
      return { kind: "skipped", index: i };
    }

    // Persist transcript + duration on the recording row.
    await withDbRetry(
      () =>
        db.sessionRecording.update({
          where: { id: recording.id },
          data: {
            transcript: transcribeResult.transcript,
            durationSeconds: transcribeResult.durationSeconds,
          },
        }),
      { label: "updateSessionRecordingTranscript" }
    );

    return {
      kind: "kept",
      index: i,
      transcript: transcribeResult.transcript,
      recordingId: recording.id,
      createdAt: recording.createdAt,
      durationSeconds: transcribeResult.durationSeconds,
    };
  }

  const outcomes = await mapWithConcurrency(
    recordings.map((_, i) => i),
    TRANSCRIPT_OUTER_CONCURRENCY,
    async (i) => processSegment(i)
  );

  const createdRecordingIds: string[] = [];
  const transcriptParts: string[] = [];
  /** Last segment's Whisper-reported duration (used for late hallucination checks). */
  let lastWhisperDurationSeconds: number | null = null;
  /**
   * Per-segment hallucinations don't fail the whole batch — we drop the bad segment
   * (delete blob + DB row) and keep going. Only if every segment was empty/junk do
   * we hard-fail with HALLUCINATION_MIC_MESSAGE. Surfacing this as a warning lets
   * tutors recover from "I accidentally stopped one of two recordings early".
   */
  let skippedHallucinationSegments = 0;
  /**
   * Per kept segment: when the row was created (≈ when MediaRecorder stopped) plus
   * Whisper-reported duration. Used to derive sessionStartedAt / sessionEndedAt so
   * the form can pre-fill Session start / end before the tutor saves. Skipped
   * (silent) segments are excluded so a 4-second silent stop doesn't pull the
   * derived end time forward.
   */
  const keptSegmentTimings: Array<{ createdAt: Date; durationSeconds: number }> = [];

  for (const o of outcomes) {
    if (o.kind === "fatal") return o.result;
    if (o.kind === "skipped") {
      skippedHallucinationSegments += 1;
      continue;
    }
    lastWhisperDurationSeconds = o.durationSeconds;
    createdRecordingIds.push(o.recordingId);
    transcriptParts.push(o.transcript);
    keptSegmentTimings.push({
      createdAt: o.createdAt,
      durationSeconds: o.durationSeconds ?? 0,
    });
  }

  // Derive session start/end from kept segments so the form can pre-fill the time
  // inputs. recordings are processed in submission order (orderIndex i), so the
  // first kept entry is the earliest and the last kept entry is the latest.
  let sessionStartedAt: string | undefined;
  let sessionEndedAt: string | undefined;
  if (keptSegmentTimings.length > 0) {
    const first = keptSegmentTimings[0];
    const last = keptSegmentTimings[keptSegmentTimings.length - 1];
    sessionStartedAt = new Date(
      first.createdAt.getTime() - first.durationSeconds * 1000
    ).toISOString();
    sessionEndedAt = last.createdAt.toISOString();
  }

  // Every segment was silent/junk — fail like the original early guard.
  if (transcriptParts.length === 0 && skippedHallucinationSegments > 0) {
    console.warn(
      `[transcribeAndGenerate] rid=${rid} all segments skipped as silence/hallucination`,
      JSON.stringify({ totalSegments: recordings.length })
    );
    return transcribeFail(rid, HALLUCINATION_MIC_MESSAGE);
  }

  // Concatenate all segment transcripts.
  // Multiple parts get a "Part X of N" header so the AI and the tutor can tell them apart.
  const rawTranscript =
    transcriptParts.length === 1
      ? transcriptParts[0]
      : transcriptParts
          .map((t, i) => `[Part ${i + 1} of ${transcriptParts.length}]\n${t}`)
          .join("\n\n");

  const trimmed = rawTranscript.trim();

  if (!trimmed) {
    console.warn(
      `[transcribeAndGenerate] rid=${rid} empty transcript`,
      JSON.stringify({ recordingIds: createdRecordingIds, segments: recordings.length })
    );
    return buildTranscribeAndGenerateResult({
      recordingIds: createdRecordingIds,
      trimmedTranscript: "",
      rawTranscript,
      genResult: null,
      debugId: rid,
      skippedHallucinationSegments,
      sessionStartedAt,
      sessionEndedAt,
    });
  }

  const student = await db.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { name: true },
  });

  const template = await db.sessionNote
    .findFirst({
      where: { studentId },
      orderBy: { date: "desc" },
      select: { template: true },
    })
    .then((n) => n?.template ?? null);

  // Whisper transcript exceeded our LLM budget. Previously this silently
  // truncated with `slice()` — meaning notes were generated from only the
  // first ~16k chars of audio without any signal to the tutor. Now we fail
  // loud: the recording rows + transcripts stay saved (so nothing is lost),
  // and the tutor sees an explicit error explaining what to do.
  // Threshold is conservative (4 chars/token); see ai.ts for the rationale on
  // MAX_INPUT_TOKENS = 30000 (~2.5 hr of normal speech).
  const TRANSCRIPT_AI_MAX_CHARS = MAX_INPUT_TOKENS * 4;
  if (trimmed.length > TRANSCRIPT_AI_MAX_CHARS) {
    console.warn(
      `[transcribeAndGenerate] rid=${rid} transcript exceeds AI input ceiling`,
      JSON.stringify({
        chars: trimmed.length,
        limitChars: TRANSCRIPT_AI_MAX_CHARS,
        recordingIds: createdRecordingIds,
      })
    );
    return transcribeFail(
      rid,
      `This session's transcript is exceptionally long (~${Math.round(trimmed.length / 1000)}k characters, beyond our current AI structuring limit of ~${Math.round(TRANSCRIPT_AI_MAX_CHARS / 1000)}k). Your recording${createdRecordingIds.length > 1 ? "s have" : " has"} been saved — please split the session into shorter recordings, or copy the transcript and paste a portion into the Paste tab to generate notes.`
    );
  }

  const genResult = await generateSessionNote({
    studentName: student.name,
    sessionText: trimmed,
    template,
    costProvenance: { adminUserId: tutorAdminId, studentId },
  });

  if ("error" in genResult) {
    console.warn(
      "[transcribeAndGenerate] AI structuring failed",
      JSON.stringify({
        recordingIds: createdRecordingIds,
        error: genResult.error,
        transcriptChars: trimmed.length,
      })
    );
  } else {
    const allEmpty =
      !genResult.topics.trim() &&
      !genResult.homework.trim() &&
      !genResult.assessment.trim() &&
      !genResult.plan.trim() &&
      !genResult.links.trim();
    if (allEmpty) {
      console.warn(
        "[transcribeAndGenerate] AI returned all-empty fields",
        JSON.stringify({ recordingIds: createdRecordingIds, transcriptChars: trimmed.length })
      );
      // Defense in depth: if the structuring model returns nothing but the transcript is still
      // obvious Whisper junk (e.g. older deploys, or a rare Unicode edge case on the pre-persist check),
      // fail like the early guard — delete blobs + rows so tutors don't save junk in Topics.
      if (looksLikeSilenceHallucination(trimmed, lastWhisperDurationSeconds)) {
        console.warn(
          `[transcribeAndGenerate] rid=${rid} late hallucination after all-empty LLM`,
          JSON.stringify({
            recordingIds: createdRecordingIds,
            transcriptChars: trimmed.length,
            durationSeconds: lastWhisperDurationSeconds,
          })
        );
        // Only delete the rows we actually kept. Per-segment skipped rows are already
        // gone, so iterating recordings.length with parallel indexing is unsafe now.
        await Promise.all(
          createdRecordingIds.map((id) =>
            withDbRetry(
              () => db.sessionRecording.delete({ where: { id } }),
              { label: "deleteSessionRecordingLateHallucination" }
            ).catch(() => undefined)
          )
        );
        // For blobs we still need the URL — look them up from the original input by
        // matching index after filtering out the ones we already deleted is fragile,
        // so just delete every blob in the batch (idempotent on already-deleted blobs).
        await Promise.all(
          recordings.map((rec) => deleteBlob(rec.blobUrl).catch(() => undefined))
        );
        return transcribeFail(rid, HALLUCINATION_MIC_MESSAGE);
      }
    }
  }

  return buildTranscribeAndGenerateResult({
    recordingIds: createdRecordingIds,
    trimmedTranscript: trimmed,
    rawTranscript,
    genResult,
    skippedHallucinationSegments,
    sessionStartedAt,
    sessionEndedAt,
  });
}


export async function setNoteStatus(noteId: string, studentId: string, status: "DRAFT" | "READY") {
  await assertOwnsMutableStudent(studentId);
  const row = await db.sessionNote.findFirst({ where: { id: noteId, studentId } });
  if (!row) return;
  await db.sessionNote.update({ where: { id: noteId }, data: { status } });
  revalidatePath(`/admin/students/${studentId}`);
}

export async function renameStudent(studentId: string, formData: FormData) {
  await assertOwnsMutableStudent(studentId);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required");
  await db.student.update({ where: { id: studentId }, data: { name } });
  revalidatePath(`/admin/students/${studentId}`);
}

export async function deleteStudent(studentId: string) {
  await assertOwnsStudent(studentId);
  await db.student.delete({ where: { id: studentId } });
  revalidatePath("/admin/students");
}

export async function updateNote(noteId: string, studentId: string, formData: FormData) {
  await assertOwnsMutableStudent(studentId);
  const existing = await db.sessionNote.findFirst({ where: { id: noteId, studentId } });
  if (!existing) return;
  const dateStr = String(formData.get("date") ?? "");
  const date = parseDateOnlyInput(dateStr);
  if (!date) throw new Error("Invalid date");

  const template = String(formData.get("template") ?? "").trim() || null;
  const topics = String(formData.get("topics") ?? "").trim();
  const homework = String(formData.get("homework") ?? "").trim();
  const assessment = String(formData.get("assessment") ?? "").trim();
  const planFromForm = String(formData.get("plan") ?? "").trim();
  const nextSteps = planFromForm || String(formData.get("nextSteps") ?? "").trim();
  const linksText = String(formData.get("links") ?? "");
  const links = parseLinksFromTextarea(linksText);

  const startTimeStr = String(formData.get("startTime") ?? "").trim();
  const endTimeStr = String(formData.get("endTime") ?? "").trim();
  const startTime = parseTimeOnDate(dateStr, startTimeStr);
  const endTime = parseTimeOnDate(dateStr, endTimeStr);

  await db.sessionNote.update({
    where: { id: noteId },
    data: { date, template, topics, homework, assessment, nextSteps, linksJson: JSON.stringify(links), startTime, endTime },
  });
  revalidatePath(`/admin/students/${studentId}`);
}

export async function deleteNote(noteId: string, studentId: string) {
  await assertOwnsMutableStudent(studentId);
  const existing = await db.sessionNote.findFirst({ where: { id: noteId, studentId } });
  if (!existing) return;
  await db.sessionNote.delete({ where: { id: noteId } });
  revalidatePath(`/admin/students/${studentId}`);
}

/**
 * IAC-13: Tutor-side disconnect — severs this Student's link to its LearnerProfile.
 *
 * Security invariants:
 *   - assertOwnsStudent runs first; tutor cannot disconnect a student they don't own (IDOR guard).
 *   - updateMany WHERE guard (id + learnerProfileId) prevents racing a concurrent re-claim.
 *   - Only THIS Student.learnerProfileId is nulled — the LearnerProfile row is untouched,
 *     so other tutors' Student rows linked to the same profile are provably unaffected (IAC-2).
 *   - LearnerDeviceSession rows are NOT touched; device sessions are profile-level and shared
 *     across tutors. Revoking them globally would be a denial-of-service against multi-tutor learners.
 *   - Pending claim invites are revoked atomically to prevent a stale link from immediately
 *     re-connecting the wrong party after disconnect.
 *   - Audit trail: structured [dsc] log line on every successful disconnect.
 *     NOTE: No StudentDisconnectLog DB table — schema migration is locked by another in-flight
 *     feature. Log-only audit until the migration lock is released (design doc §3 Delta 1 deferred).
 */
export async function disconnectLearnerProfile(studentId: string): Promise<void> {
  const scope = await requireStudentScope();
  const adminUserId = scope.kind === "admin" ? scope.adminId : null;

  // Ownership gate — throws notFound if this tutor does not own the student.
  await assertOwnsStudent(studentId);

  const now = new Date();

  await db.$transaction(async (tx) => {
    // Step 1 — capture pre-disconnect state (needed for WHERE guard + audit log)
    const student = await tx.student.findUnique({
      where: { id: studentId },
      select: {
        learnerProfileId: true,
        learnerProfile: {
          select: { accountHolderId: true },
        },
      },
    });

    if (!student?.learnerProfileId) return; // already disconnected — idempotent

    const { learnerProfileId } = student;
    const accountHolderId = student.learnerProfile?.accountHolderId ?? null;

    // Step 2 — null Student.learnerProfileId with WHERE guard.
    // The guard (id AND learnerProfileId = <known>) prevents this disconnect from
    // silently nulling a DIFFERENT profile that was re-claimed between our read and write.
    const updated = await tx.student.updateMany({
      where: { id: studentId, learnerProfileId },
      data: { learnerProfileId: null },
    });
    if (updated.count === 0) return; // concurrent disconnect or re-claim won — idempotent

    // Step 3 — revoke all pending (unclaimed, unexpired) invites.
    // Historical completed invite records (claimedAt non-null) are intentionally preserved
    // as business records per the tombstone principle.
    await tx.studentClaimInvite.updateMany({
      where: {
        studentId,
        claimedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now },
    });

    // Step 4 — structured audit log (log-only; DB table deferred — see JSDoc above).
    console.log(
      `[dsc] action=tutor_disconnect_parent studentId=${studentId} adminUserId=${adminUserId ?? "env"} learnerProfileId=${learnerProfileId} accountHolderId=${accountHolderId ?? "unknown"}`
    );
  });

  revalidatePath(`/admin/students/${studentId}`);
}

export type SendUpdateResult = {
  ok: boolean;
  sent: boolean;
  outboxOnly?: boolean;
  error?: string;
  toEmail?: string;
};

export async function sendUpdateEmail(
  _prev: SendUpdateResult | null,
  formData: FormData
): Promise<SendUpdateResult> {
  const studentId = String(formData.get("studentId") ?? "").trim();
  await assertOwnsMutableStudent(studentId);
  const toEmail = String(formData.get("toEmail") ?? "").trim();
  if (!studentId || !toEmail) return { ok: false, sent: false, error: "Student and email required" };

  const activeLink =
    (await db.shareLink.findFirst({
      where: { studentId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    })) ??
    (await db.shareLink.create({
      data: { studentId, token: generateShareToken() },
    }));

  const linkUrl = `${baseUrl()}/s/${activeLink.token}`;

  const student = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  const { signer, fromDisplayName } = await resolveTutorDisplayName();

  // Exclude DRAFT auto-notes: parents must never see unreviewed auto-generated content.
  const noteCount = await db.sessionNote.count({
    where: { studentId, status: { not: "DRAFT" } },
  });
  const latestNote = await db.sessionNote.findFirst({
    where: { studentId, status: { not: "DRAFT" } },
    orderBy: { date: "desc" },
  });

  const noteCountLabel = noteCount === 1 ? "1 session note" : `${noteCount} session notes`;

  const recentPreview =
    latestNote?.topics?.trim()
      ? `\nMost recent session: ${latestNote.topics.trim()}\n`
      : "\n";

  const subject = `Session notes for ${student.name} (${noteCountLabel})`;
  const bodyText = `Hi,

${signer} has posted ${noteCountLabel} for ${student.name}.${recentPreview}
Log in to see the notes, homework, assessment, and the plan for next time:
${linkUrl}

${noteCount > 1 ? `This email shows only the most recent session. Open the link to see all ${noteCount} notes.` : "Open the link to see the full note with homework, assessment, and the plan for next time."}

— ${signer}`;

  const scope = await requireStudentScope();
  await db.emailMessage.create({
    data: {
      toEmail, subject, bodyText, linkUrl,
      adminUserId: scope.kind === "admin" ? scope.adminId : null,
    },
  });

  const { sent, error } = await sendMail({
    to: toEmail,
    subject,
    text: bodyText,
    fromDisplayName,
    adminUserId: scope.kind === "admin" ? scope.adminId : null,
  });

  if (error) {
    console.error("[sendUpdateEmail] SMTP error:", error);
    // Do NOT mark notes as SENT — the email failed to deliver.
    revalidatePath(`/admin/students/${studentId}`);
    revalidatePath("/admin/outbox");
    return { ok: true, sent: false, error, toEmail };
  }

  await db.student.update({
    where: { id: studentId },
    data: { parentEmail: toEmail },
  });

  // Only flip READY → SENT; DRAFT auto-notes must never be marked SENT.
  await db.sessionNote.updateMany({
    where: { studentId, status: "READY" },
    data: { status: "SENT", sentAt: new Date() },
  });

  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/admin/outbox");

  if (sent) return { ok: true, sent: true, toEmail };
  // outboxOnly: email not configured, message saved to outbox — still mark notes sent
  // since the tutor intentionally triggered the send and can manually deliver the link.
  return { ok: true, sent: false, outboxOnly: true, toEmail };
}

// uploadAudioAction (server-action upload via FormData) was removed in B1.
// All audio now uploads browser→Vercel Blob directly through
// src/app/api/upload/audio/route.ts + src/lib/recording/upload.ts so we
// don't hit the 4.5MB Vercel function body cap that broke Sarah's
// 17.9MB pilot recording. assertOwnsStudent + size cap still enforced;
// they moved to the route handler's onBeforeGenerateToken callback.

