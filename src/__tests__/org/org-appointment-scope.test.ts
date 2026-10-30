import type { OrgRole } from "@prisma/client";
import {
  orgAppointmentListScope,
  orgLearnerFilterForViewer,
} from "@/lib/org-appointment-scope";

describe("org appointment list scope", () => {
  it.each(["owner", "admin", "scheduler"] as const)(
    "%s sees every appointment and ignores a learner filter",
    (role: OrgRole) => {
      expect(orgAppointmentListScope([role])).toBe("staff");
      expect(orgLearnerFilterForViewer([role], "learner-1")).toBeUndefined();
    }
  );

  it("an instructor who is also a scheduler sees every appointment", () => {
    expect(orgAppointmentListScope(["instructor", "scheduler"])).toBe("staff");
    expect(orgLearnerFilterForViewer(["instructor", "scheduler"], "learner-1")).toBeUndefined();
  });

  it("an instructor-only viewer is limited to their rows and keeps a learner filter", () => {
    expect(orgAppointmentListScope(["instructor"])).toBe("instructor");
    expect(orgLearnerFilterForViewer(["instructor"], " learner-1 ")).toBe("learner-1");
    expect(orgLearnerFilterForViewer(["instructor"], "   ")).toBeUndefined();
    expect(orgLearnerFilterForViewer(["instructor"], undefined)).toBeUndefined();
    expect(orgLearnerFilterForViewer(["instructor"], null)).toBeUndefined();
  });
});
