import { WB_LASER_STUDENT_HEX, WB_LASER_TUTOR_HEX } from "@/styles/token-values";

/** Per-role laser color for Excalidraw collaborator overlay (`pointer.laserColor`). */
export function laserColorForRole(role: "tutor" | "student"): string {
  return role === "tutor" ? WB_LASER_TUTOR_HEX : WB_LASER_STUDENT_HEX;
}

/** Collaborator overlay entry for an inbound laser/pointer wire message. */
export function buildCollaboratorLaserEntry(args: {
  role: "tutor" | "student";
  x: number;
  y: number;
  button: "up" | "down";
}) {
  const strokeColor = laserColorForRole(args.role);
  return {
    pointer: {
      x: args.x,
      y: args.y,
      tool: "laser" as const,
      renderCursor: false,
      laserColor: strokeColor,
    },
    button: args.button,
    username: args.role === "tutor" ? "Tutor" : "Student",
    color: { background: strokeColor, stroke: strokeColor },
  };
}
