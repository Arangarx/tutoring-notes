import {
  alignStudentScrollToTutorCenter,
  sceneCenterFromScroll,
  scrollFromSceneCenter,
} from "@/lib/whiteboard/viewport-align";

function expectSameSceneCenter(
  tutorScrollX: number,
  tutorScrollY: number,
  tutorZoom: number,
  tutorVw: number,
  tutorVh: number,
  studentScrollX: number,
  studentScrollY: number,
  studentVw: number,
  studentVh: number
) {
  const tutorCenter = sceneCenterFromScroll(
    tutorScrollX,
    tutorScrollY,
    tutorZoom,
    tutorVw,
    tutorVh
  );
  const studentCenter = sceneCenterFromScroll(
    studentScrollX,
    studentScrollY,
    tutorZoom,
    studentVw,
    studentVh
  );
  expect(studentCenter.x).toBe(tutorCenter.x);
  expect(studentCenter.y).toBe(tutorCenter.y);
}

describe("viewport-align", () => {
  describe("student viewport center maps to tutor viewport center at matched zoom", () => {
    it("equal-size viewports: student scroll equals tutor scroll (zero offset)", () => {
      const aligned = alignStudentScrollToTutorCenter(
        {
          panX: 100,
          panY: 50,
          zoom: 1,
          viewportWidth: 800,
          viewportHeight: 600,
        },
        800,
        600
      );
      expect(aligned.scrollX).toBe(100);
      expect(aligned.scrollY).toBe(50);
      expect(aligned.zoom).toBe(1);
      expectSameSceneCenter(100, 50, 1, 800, 600, 100, 50, 800, 600);
    });

    it("tutor 1440×900 desktop → student 390×844 phone at zoom 1", () => {
      const aligned = alignStudentScrollToTutorCenter(
        {
          panX: 0,
          panY: 0,
          zoom: 1,
          viewportWidth: 1440,
          viewportHeight: 900,
        },
        390,
        844
      );
      // scroll_student = scroll_tutor + (vw_tutor - vw_student) / (2*z)
      expect(aligned.scrollX).toBe(525);
      expect(aligned.scrollY).toBe(28);
      expect(aligned.zoom).toBe(1);
      expectSameSceneCenter(0, 0, 1, 1440, 900, 525, 28, 390, 844);
    });

    it("same desktop→phone pair at zoom 0.5", () => {
      const aligned = alignStudentScrollToTutorCenter(
        {
          panX: 0,
          panY: 0,
          zoom: 0.5,
          viewportWidth: 1440,
          viewportHeight: 900,
        },
        390,
        844
      );
      expect(aligned.scrollX).toBe(1050);
      expect(aligned.scrollY).toBe(56);
      expect(aligned.zoom).toBe(0.5);
      expectSameSceneCenter(0, 0, 0.5, 1440, 900, 1050, 56, 390, 844);
    });

    it("same desktop→phone pair at zoom 2", () => {
      const aligned = alignStudentScrollToTutorCenter(
        {
          panX: 0,
          panY: 0,
          zoom: 2,
          viewportWidth: 1440,
          viewportHeight: 900,
        },
        390,
        844
      );
      expect(aligned.scrollX).toBe(262.5);
      expect(aligned.scrollY).toBe(14);
      expect(aligned.zoom).toBe(2);
      expectSameSceneCenter(0, 0, 2, 1440, 900, 262.5, 14, 390, 844);
    });

    it("tutor viewport smaller than student (phone → desktop)", () => {
      const aligned = alignStudentScrollToTutorCenter(
        {
          panX: 100,
          panY: 50,
          zoom: 1,
          viewportWidth: 390,
          viewportHeight: 844,
        },
        1440,
        900
      );
      expect(aligned.scrollX).toBe(-425);
      expect(aligned.scrollY).toBe(22);
      expect(aligned.zoom).toBe(1);
      expectSameSceneCenter(100, 50, 1, 390, 844, -425, 22, 1440, 900);
    });

    it("fails raw scroll copy for mismatched sizes (regression guard)", () => {
      const aligned = alignStudentScrollToTutorCenter(
        {
          panX: 0,
          panY: 0,
          zoom: 1,
          viewportWidth: 1440,
          viewportHeight: 900,
        },
        390,
        844
      );
      expect(aligned.scrollX).not.toBe(0);
      expect(aligned.scrollY).not.toBe(0);
    });
  });

  it("center-aligns student scroll for mismatched viewport sizes (legacy case)", () => {
    const aligned = alignStudentScrollToTutorCenter(
      {
        panX: 100,
        panY: 50,
        zoom: 1,
        viewportWidth: 1200,
        viewportHeight: 900,
      },
      800,
      600
    );
    expect(aligned.scrollX).toBe(300);
    expect(aligned.scrollY).toBe(200);
    expect(aligned.zoom).toBe(1);
  });

  it("scene center round-trips through scroll helpers", () => {
    const center = sceneCenterFromScroll(10, 20, 2, 400, 300);
    const back = scrollFromSceneCenter(center.x, center.y, 2, 400, 300);
    expect(back.scrollX).toBe(10);
    expect(back.scrollY).toBe(20);
  });
});
