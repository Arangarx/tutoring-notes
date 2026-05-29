import {
  followWireFromTutorAppState,
  studentScrollFromFollowCenter,
  viewportSceneCenterFromScroll,
  viewportCoordsToSceneCoords,
} from "@/lib/whiteboard/viewport-align";

/** Oracle: scene point at viewport center after applying student scroll. */
function sceneCenterAtViewportCenter(
  scrollX: number,
  scrollY: number,
  zoom: number,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  return viewportCoordsToSceneCoords(
    { clientX: viewportWidth / 2, clientY: viewportHeight / 2 },
    {
      zoom: { value: zoom },
      offsetLeft: 0,
      offsetTop: 0,
      scrollX,
      scrollY,
    }
  );
}

function expectStudentViewportMatchesTutorCenter(
  tutorCenterX: number,
  tutorCenterY: number,
  zoom: number,
  studentScrollX: number,
  studentScrollY: number,
  studentVw: number,
  studentVh: number
) {
  const studentCenter = sceneCenterAtViewportCenter(
    studentScrollX,
    studentScrollY,
    zoom,
    studentVw,
    studentVh
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

describe("viewport-align (follow mode B)", () => {
  const pairs: Array<{
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

  it.each(pairs)(
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

  it("tutor wire center matches Excalidraw viewportCoordsToSceneCoords at viewport center", () => {
    const scrollX = 42;
    const scrollY = -17;
    const zoom = 1.5;
    const vw = 1024;
    const vh = 768;
    const follow = tutorFollowFromPan(scrollX, scrollY, zoom, vw, vh);
    const oracle = viewportSceneCenterFromScroll(scrollX, scrollY, zoom, vw, vh);
    expect(follow.centerSceneX).toBeCloseTo(oracle.x, 10);
    expect(follow.centerSceneY).toBeCloseTo(oracle.y, 10);
  });
});
