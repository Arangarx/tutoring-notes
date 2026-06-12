import {
  buildCollaboratorLaserEntry,
  laserColorForRole,
} from "@/lib/whiteboard/laser-colors";
import { WB_LASER_STUDENT_HEX, WB_LASER_TUTOR_HEX } from "@/styles/token-values";

describe("laser-colors", () => {
  test("tutor role uses coral WB_LASER_TUTOR_HEX", () => {
    expect(laserColorForRole("tutor")).toBe("#e27d60");
    expect(laserColorForRole("tutor")).toBe(WB_LASER_TUTOR_HEX);
  });

  test("student role uses sky WB_LASER_STUDENT_HEX", () => {
    expect(laserColorForRole("student")).toBe("#0891b2");
    expect(laserColorForRole("student")).toBe(WB_LASER_STUDENT_HEX);
  });

  test("buildCollaboratorLaserEntry applies coral laserColor for tutor pointer", () => {
    const entry = buildCollaboratorLaserEntry({
      role: "tutor",
      x: 100,
      y: 200,
      button: "down",
    });

    expect(entry.pointer?.laserColor).toBe(WB_LASER_TUTOR_HEX);
    expect(entry.color).toEqual({
      background: WB_LASER_TUTOR_HEX,
      stroke: WB_LASER_TUTOR_HEX,
    });
    expect(entry.pointer).toMatchObject({
      x: 100,
      y: 200,
      tool: "laser",
      renderCursor: false,
    });
  });
});
