import { expect, test } from "@playwright/test";

import {
  advanceErasureGracePastDeadline,
  DELETED_LEARNER_NAME,
  readContentIntegrityOracle,
  readErasureJobOracle,
  readLearnerErasureOracle,
  requestErasureForLearner,
  runErasurePurge,
  seedPostGracePurgeFixture,
  type PostGracePurgeFixture,
} from "./erasure.helpers";

const TUTOR_STATE = "tests/integration/.auth/tutor.json";

function oracleOpts(
  fixture: PostGracePurgeFixture,
  jobId: string
): Parameters<typeof readContentIntegrityOracle>[0] {
  return {
    jobId,
    studentId: fixture.studentId,
    learnerProfileId: fixture.learnerProfileId,
    noteId: fixture.noteId,
    shareToken: fixture.shareToken,
    sessionId: fixture.sessionId,
  };
}

test.describe("P1-ID-3 — erasure post-grace purge (pre-grace content survival)", () => {
  test("grace period honors content: DB rows intact and purge worker grace-gated", async () => {
    const fixture = await seedPostGracePurgeFixture();
    const { jobId } = await requestErasureForLearner({
      adminUserId: fixture.erasureAdminUserId,
      learnerProfileId: fixture.learnerProfileId,
      confirmPhrase: fixture.learnerDisplayName,
    });

    const job = await readErasureJobOracle(jobId);
    expect(job).not.toBeNull();
    expect(job!.status).toBe("requested");
    expect(job!.purgeEligibleAt.getTime()).toBeGreaterThan(Date.now());

    const learner = await readLearnerErasureOracle(
      fixture.learnerProfileId,
      fixture.studentId
    );
    expect(learner.tombstonedAt).not.toBeNull();
    expect(learner.credentialDisabled).toBe(true);
    expect(learner.studentErasedAt).toBeNull();

    const preGrace = await readContentIntegrityOracle(oracleOpts(fixture, jobId));
    expect(preGrace.jobStatus).toBe("requested");
    expect(preGrace.studentErasedAt).toBeNull();
    expect(preGrace.studentName).toBe(fixture.originalStudentName);
    expect(preGrace.noteTopics).toBe(fixture.originalTopics);
    expect(preGrace.recordingCount).toBe(1);
    expect(preGrace.credentialCount).toBe(1);
    expect(preGrace.shareLinkRevokedAt).toBeNull();
    expect(preGrace.sessionEventsBlobUrl.length).toBeGreaterThan(0);

    const graceGated = await runErasurePurge(jobId);
    expect(graceGated.status).toBe("requested");

    const stillIntact = await readContentIntegrityOracle(oracleOpts(fixture, jobId));
    expect(stillIntact.studentErasedAt).toBeNull();
    expect(stillIntact.noteTopics).toBe(fixture.originalTopics);
    expect(stillIntact.recordingCount).toBe(1);
  });
});

test.describe("P1-ID-3 — erasure post-grace purge (hard purge teeth)", () => {
  test.use({ storageState: TUTOR_STATE });

  test("post-grace purge hard-removes content (DB oracle) and access stays denied", async ({
    page,
    request,
  }) => {
    const fixture = await seedPostGracePurgeFixture();
    const { jobId } = await requestErasureForLearner({
      adminUserId: fixture.erasureAdminUserId,
      learnerProfileId: fixture.learnerProfileId,
      confirmPhrase: fixture.learnerDisplayName,
    });

    const prePurge = await readContentIntegrityOracle(oracleOpts(fixture, jobId));
    expect(prePurge.noteTopics).toBe(fixture.originalTopics);
    expect(prePurge.recordingCount).toBe(1);
    expect(prePurge.studentErasedAt).toBeNull();

    await advanceErasureGracePastDeadline(jobId);
    const purged = await runErasurePurge(jobId);
    expect(purged.status).toBe("completed");

    const postPurge = await readContentIntegrityOracle(oracleOpts(fixture, jobId));
    expect(postPurge.jobStatus).toBe("completed");
    expect(postPurge.studentErasedAt).not.toBeNull();
    expect(postPurge.studentName).toBe(DELETED_LEARNER_NAME);
    expect(postPurge.noteTopics).toBe("");
    expect(postPurge.noteTopics).not.toContain(fixture.originalTopics);
    expect(postPurge.recordingCount).toBe(0);
    expect(postPurge.credentialCount).toBe(0);
    expect(postPurge.shareLinkRevokedAt).not.toBeNull();
    expect(postPurge.sessionEventsBlobUrl).toBe("");

    const tutorReplay = await page.goto(
      `/admin/students/${fixture.studentId}/whiteboard/${fixture.sessionId}`
    );
    expect(tutorReplay?.status()).toBe(404);

    const sharePages = [
      `/s/${fixture.shareToken}`,
      `/s/${fixture.shareToken}/all`,
      `/s/${fixture.shareToken}/whiteboard/${fixture.sessionId}`,
    ];
    for (const sharePath of sharePages) {
      const resp = await page.goto(sharePath);
      expect(resp?.status(), sharePath).toBe(404);
    }

    const apiPaths = [
      `/api/whiteboard/${fixture.sessionId}/public-events?token=${fixture.shareToken}`,
      `/api/whiteboard/${fixture.sessionId}/public-snapshot?token=${fixture.shareToken}`,
      `/api/audio/${fixture.recordingId}?token=${fixture.shareToken}`,
    ];
    for (const apiPath of apiPaths) {
      const apiResp = await request.get(apiPath);
      // Grace: erasure guard → 404. Post-purge: share link revoked → 403 (or 404).
      expect([403, 404], apiPath).toContain(apiResp.status());
    }
  });
});
