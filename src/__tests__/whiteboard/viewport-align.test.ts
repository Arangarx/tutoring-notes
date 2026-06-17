import {
  followWireFromTutorAppState,
  replayScrollFromRecordedViewport,
  studentScrollFromFollowCenter,
  viewportSceneCenterFromScroll,
  viewportCoordsToSceneCoords,
} from "@/lib/whiteboard/viewport-align";
import { computeResizeScroll } from "@/lib/whiteboard/scene-paint";

/** Independent oracle: Excalidraw client coords at the visual viewport center. */
function sceneCenterOracle(
  scrollX: number,
  scrollY: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  offsetLeft: number,
  offsetTop: number
): { x: number; y: number } {
  return viewportCoordsToSceneCoords(
    {
      clientX: offsetLeft + viewportWidth / 2,
      clientY: offsetTop + viewportHeight / 2,
    },
    {
      zoom: { value: zoom },
      offsetLeft,
      offsetTop,
      scrollX,
      scrollY,
    }
  );
}

/** Oracle: scene point at viewport center after applying student scroll. */
function sceneCenterAtViewportCenter(
  scrollX: number,
  scrollY: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number,
  offsetLeft = 0,
  offsetTop = 0
): { x: number; y: number } {
  return sceneCenterOracle(
    scrollX,
    scrollY,
    zoom,
    viewportWidth,
    viewportHeight,
    offsetLeft,
    offsetTop
  );
}

function expectStudentViewportMatchesTutorCenter(
  tutorCenterX: number,
  tutorCenterY: number,
  zoom: number,
  studentScrollX: number,
  studentScrollY: number,
  studentVw: number,
  studentVh: number,
  studentOffsetLeft = 0,
  studentOffsetTop = 0
) {
  const studentCenter = sceneCenterAtViewportCenter(
    studentScrollX,
    studentScrollY,
    zoom,
    studentVw,
    studentVh,
    studentOffsetLeft,
    studentOffsetTop
  );
  expect(studentCenter.x).toBeCloseTo(tutorCenterX, 5);
  expect(studentCenter.y).toBeCloseTo(tutorCenterY, 5);
}

function tutorFollowFromPan(
  scrollX: number,
  scrollY: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number
) {
  const wire = followWireFromTutorAppState({
    scrollX,
    scrollY,
    zoom: { value: zoom },
    width: viewportWidth,
    height: viewportHeight,
  });
  if (!wire) throw new Error("tutor viewport dims required");
  return wire;
}

const viewportSizePairs: Array<{
  name: string;
  tutor: { scrollX: number; scrollY: number; zoom: number; vw: number; vh: number };
  student: { vw: number; vh: number };
}> = [
    {
      name: "equal 800×600 @ z1",
      tutor: { scrollX: 100, scrollY: 50, zoom: 1, vw: 800, vh: 600 },
      student: { vw: 800, vh: 600 },
    },
    {
      name: "landscape tutor 1440×900 → portrait student 390×844 @ z1",
      tutor: { scrollX: 0, scrollY: 0, zoom: 1, vw: 1440, vh: 900 },
      student: { vw: 390, vh: 844 },
    },
    {
      name: "landscape tutor → portrait student @ z0.5",
      tutor: { scrollX: 0, scrollY: 0, zoom: 0.5, vw: 1440, vh: 900 },
      student: { vw: 390, vh: 844 },
    },
    {
      name: "landscape tutor → portrait student @ z2",
      tutor: { scrollX: 0, scrollY: 0, zoom: 2, vw: 1440, vh: 900 },
      student: { vw: 390, vh: 844 },
    },
    {
      name: "phone tutor 390×844 → desktop student 1440×900 @ z1",
      tutor: { scrollX: 100, scrollY: 50, zoom: 1, vw: 390, vh: 844 },
      student: { vw: 1440, vh: 900 },
    },
];

describe("viewport-align (follow mode B)", () => {
  it.each(viewportSizePairs)(
    "after apply, student viewport center scene coords match tutor broadcast center ($name)",
    ({ tutor, student }) => {
      const follow = tutorFollowFromPan(
        tutor.scrollX,
        tutor.scrollY,
        tutor.zoom,
        tutor.vw,
        tutor.vh
      );
      const aligned = studentScrollFromFollowCenter(
        follow,
        student.vw,
        student.vh
      );
      expect(aligned.zoom).toBe(tutor.zoom);
      expectStudentViewportMatchesTutorCenter(
        follow.centerSceneX,
        follow.centerSceneY,
        tutor.zoom,
        aligned.scrollX,
        aligned.scrollY,
        student.vw,
        student.vh
      );
    }
  );

  it("does not match raw tutor scroll copy on mismatched sizes", () => {
    const follow = tutorFollowFromPan(0, 0, 1, 1440, 900);
    const aligned = studentScrollFromFollowCenter(follow, 390, 844);
    expect(aligned.scrollX).not.toBe(0);
    expect(aligned.scrollY).not.toBe(0);
  });

  it("tutor wire center matches vendored transform at visual viewport center", () => {
    const scrollX = 42;
    const scrollY = -17;
    const zoom = 1.5;
    const vw = 1024;
    const vh = 768;
    const offsetLeft = 73;
    const offsetTop = 250;
    const follow = followWireFromTutorAppState({
      scrollX,
      scrollY,
      zoom: { value: zoom },
      width: vw,
      height: vh,
      offsetLeft,
      offsetTop,
    });
    if (!follow) throw new Error("tutor viewport dims required");
    const oracle = sceneCenterOracle(
      scrollX,
      scrollY,
      zoom,
      vw,
      vh,
      offsetLeft,
      offsetTop
    );
    expect(follow.centerSceneX).toBeCloseTo(oracle.x, 10);
    expect(follow.centerSceneY).toBeCloseTo(oracle.y, 10);
  });
});

describe("viewportSceneCenterFromScroll offset invariance", () => {
  const scrollX = 120;
  const scrollY = -45;
  const base = { scrollX, scrollY, vw: 1440, vh: 900 };

  const zoomLevels = [0.5, 1, 2] as const;
  const offsetCases = [0, 73, 250, -40] as const;

  it.each(zoomLevels)(
    "scene center is unchanged when offsetLeft/offsetTop vary @ zoom=%s",
    (zoom) => {
      const baseline = viewportSceneCenterFromScroll(
        base.scrollX,
        base.scrollY,
        zoom,
        base.vw,
        base.vh,
        0,
        0
      );
      for (const offsetLeft of offsetCases) {
        for (const offsetTop of offsetCases) {
          const center = viewportSceneCenterFromScroll(
            base.scrollX,
            base.scrollY,
            zoom,
            base.vw,
            base.vh,
            offsetLeft,
            offsetTop
          );
          expect(center.x).toBeCloseTo(baseline.x, 10);
          expect(center.y).toBeCloseTo(baseline.y, 10);
        }
      }
    }
  );

  it.each(zoomLevels)(
    "matches vendored viewportCoordsToSceneCoords oracle @ zoom=%s",
    (zoom) => {
      const offsetLeft = 88;
      const offsetTop = 144;
      const center = viewportSceneCenterFromScroll(
        scrollX,
        scrollY,
        zoom,
        base.vw,
        base.vh,
        offsetLeft,
        offsetTop
      );
      const oracle = sceneCenterOracle(
        scrollX,
        scrollY,
        zoom,
        base.vw,
        base.vh,
        offsetLeft,
        offsetTop
      );
      expect(center.x).toBeCloseTo(oracle.x, 10);
      expect(center.y).toBeCloseTo(oracle.y, 10);
    }
  );

  it("landscape → portrait dimension swap keeps offset invariance @ z1", () => {
    const landscape = { vw: 1440, vh: 900 };
    const portrait = { vw: 390, vh: 844 };
    for (const dims of [landscape, portrait]) {
      const baseline = viewportSceneCenterFromScroll(
        scrollX,
        scrollY,
        1,
        dims.vw,
        dims.vh,
        0,
        0
      );
      const shifted = viewportSceneCenterFromScroll(
        scrollX,
        scrollY,
        1,
        dims.vw,
        dims.vh,
        200,
        120
      );
      expect(shifted.x).toBeCloseTo(baseline.x, 10);
      expect(shifted.y).toBeCloseTo(baseline.y, 10);
      expect(shifted.x).toBeCloseTo(
        sceneCenterOracle(scrollX, scrollY, 1, dims.vw, dims.vh, 200, 120).x,
        10
      );
      expect(shifted.y).toBeCloseTo(
        sceneCenterOracle(scrollX, scrollY, 1, dims.vw, dims.vh, 200, 120).y,
        10
      );
    }
  });

  it.each(viewportSizePairs)(
    "student apply with non-zero canvas offset still matches tutor center ($name)",
    ({ tutor, student }) => {
      const follow = followWireFromTutorAppState({
        scrollX: tutor.scrollX,
        scrollY: tutor.scrollY,
        zoom: { value: tutor.zoom },
        width: tutor.vw,
        height: tutor.vh,
        offsetLeft: 120,
        offsetTop: 64,
      });
      if (!follow) throw new Error("tutor viewport dims required");
      const aligned = studentScrollFromFollowCenter(
        follow,
        student.vw,
        student.vh,
        48,
        200
      );
      expectStudentViewportMatchesTutorCenter(
        follow.centerSceneX,
        follow.centerSceneY,
        tutor.zoom,
        aligned.scrollX,
        aligned.scrollY,
        student.vw,
        student.vh,
        48,
        200
      );
    }
  );
});

describe("replayScrollFromRecordedViewport (replay center-match)", () => {
  const record = {
    panX: 120,
    panY: -45,
    zoom: 1.25,
    viewportWidth: 1440,
    viewportHeight: 900,
  };

  function oracleSceneCenterAtReplayCenter(
    scrollX: number,
    scrollY: number,
    zoom: number,
    replayW: number,
    replayH: number,
    offsetLeft = 0,
    offsetTop = 0
  ): { x: number; y: number } {
    return sceneCenterOracle(
      scrollX,
      scrollY,
      zoom,
      replayW,
      replayH,
      offsetLeft,
      offsetTop
    );
  }

  it("places record-time scene center at replay viewport center when sizes differ", () => {
    const replayW = 800;
    const replayH = 520;
    const recordCenter = viewportSceneCenterFromScroll(
      record.panX,
      record.panY,
      record.zoom,
      record.viewportWidth,
      record.viewportHeight
    );
    const aligned = replayScrollFromRecordedViewport(
      record,
      replayW,
      replayH
    );
    expect(aligned).not.toBeNull();
    expect(aligned!.zoom).toBe(record.zoom);
    const replayCenter = oracleSceneCenterAtReplayCenter(
      aligned!.scrollX,
      aligned!.scrollY,
      record.zoom,
      replayW,
      replayH
    );
    expect(replayCenter.x).toBeCloseTo(recordCenter.x, 10);
    expect(replayCenter.y).toBeCloseTo(recordCenter.y, 10);
    expect(aligned!.scrollX).not.toBe(record.panX);
    expect(aligned!.scrollY).not.toBe(record.panY);
  });

  it("matches computeResizeScroll one-shot when record and replay sizes differ", () => {
    const replayW = 640;
    const replayH = 480;
    const aligned = replayScrollFromRecordedViewport(
      record,
      replayW,
      replayH
    );
    const viaResize = computeResizeScroll({
      scrollX: record.panX,
      scrollY: record.panY,
      zoom: record.zoom,
      oldWidth: record.viewportWidth,
      oldHeight: record.viewportHeight,
      newWidth: replayW,
      newHeight: replayH,
    });
    expect(aligned!.scrollX).toBeCloseTo(viaResize.scrollX, 10);
    expect(aligned!.scrollY).toBeCloseTo(viaResize.scrollY, 10);
  });

  it("keeps center after a viewport-size change (resize) without reverting to raw record scroll", () => {
    const firstReplay = replayScrollFromRecordedViewport(record, 900, 600);
    expect(firstReplay).not.toBeNull();
    const resized = replayScrollFromRecordedViewport(record, 500, 700);
    expect(resized).not.toBeNull();
    const recordCenter = viewportSceneCenterFromScroll(
      record.panX,
      record.panY,
      record.zoom,
      record.viewportWidth,
      record.viewportHeight
    );
    const afterResize = oracleSceneCenterAtReplayCenter(
      resized!.scrollX,
      resized!.scrollY,
      record.zoom,
      500,
      700
    );
    expect(afterResize.x).toBeCloseTo(recordCenter.x, 10);
    expect(afterResize.y).toBeCloseTo(recordCenter.y, 10);
    expect(resized!.scrollX).not.toBe(firstReplay!.scrollX);
    expect(resized!.zoom).toBe(record.zoom);
  });

  it("is identity on scroll when record and replay sizes match", () => {
    const aligned = replayScrollFromRecordedViewport(
      record,
      record.viewportWidth,
      record.viewportHeight
    );
    expect(aligned!.scrollX).toBeCloseTo(record.panX, 10);
    expect(aligned!.scrollY).toBeCloseTo(record.panY, 10);
    expect(aligned!.zoom).toBe(record.zoom);
  });

  it("returns null when record dimensions are missing and legacy fallback is disabled", () => {
    expect(
      replayScrollFromRecordedViewport(
        { panX: 0, panY: 0, zoom: 1 },
        800,
        600,
        0,
        0,
        { allowLegacyRecordSizeFallback: false }
      )
    ).toBeNull();
  });

  const replayOffsetCases = [0, 73, 250, -40] as const;

  it.each(replayOffsetCases)(
    "offset invariance: replay center matches record center when offsetLeft=%s",
    (offsetLeft) => {
      const offsetTop = 88;
      const replayW = 1024;
      const replayH = 640;
      const recordCenter = viewportSceneCenterFromScroll(
        record.panX,
        record.panY,
        record.zoom,
        record.viewportWidth,
        record.viewportHeight,
        offsetLeft,
        offsetTop
      );
      const aligned = replayScrollFromRecordedViewport(
        record,
        replayW,
        replayH,
        offsetLeft,
        offsetTop
      );
      const replayCenter = oracleSceneCenterAtReplayCenter(
        aligned!.scrollX,
        aligned!.scrollY,
        record.zoom,
        replayW,
        replayH,
        offsetLeft,
        offsetTop
      );
      expect(replayCenter.x).toBeCloseTo(recordCenter.x, 10);
      expect(replayCenter.y).toBeCloseTo(recordCenter.y, 10);
    }
  );
});
