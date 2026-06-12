/**
 * Programmatic color strings for APIs that cannot use CSS variables
 * (Excalidraw export, canvas). Values mirror src/styles/tokens.css dark
 * defaults; prefer var(--token) in React inline styles.
 */
export const EXCALIDRAW_STROKE = "var(--excalidraw-stroke)";
export const EXCALIDRAW_BG_LIGHT = "var(--excalidraw-bg)";
export const EXCALIDRAW_BG_DARK = "var(--excalidraw-bg-dark)";

/** Resolved hex for server/tests that need a literal (dark board default). */
export const EXCALIDRAW_BG_LIGHT_HEX = "#ffffff";
export const EXCALIDRAW_BG_DARK_HEX = "#121212";
/** Default stroke in light mode (near-black, visible on white canvas). */
export const EXCALIDRAW_STROKE_HEX = "#1e293b";
/** Default stroke in dark mode (white, visible on dark Excalidraw canvas). */
export const EXCALIDRAW_STROKE_DARK_HEX = "#ffffff";

/** Theme-adaptive display hex for ink summary swatches (stored value stays #1e293b). */
export function inkDisplayHex(
  strokeColor: string,
  excalidrawTheme: "light" | "dark"
): string {
  if (strokeColor === EXCALIDRAW_STROKE_HEX) {
    return excalidrawTheme === "dark"
      ? EXCALIDRAW_STROKE_DARK_HEX
      : EXCALIDRAW_STROKE_HEX;
  }
  return strokeColor;
}

/** Edge OG ImageResponse cannot resolve CSS variables. */
export const FAVICON_BRAND_BG = "#7c5cff";

/**
 * Sentinel value for the theme-adaptive "ink" swatch. Resolved at render time
 * to EXCALIDRAW_STROKE_HEX (light) or EXCALIDRAW_STROKE_DARK_HEX (dark) so
 * the displayed swatch color always matches what it actually draws.
 */
export const WB_INK_ADAPTIVE_SENTINEL = "INK_ADAPTIVE" as const;

/**
 * Stroke color presets for the Mynk whiteboard toolbar.
 * Excalidraw's currentItemStrokeColor requires resolved hex — CSS vars cannot
 * be used here. Labels are for aria-label; display uses the actual color.
 *
 * The WB_INK_ADAPTIVE_SENTINEL entry is a single theme-adaptive "ink" slot:
 * black (#1e293b) in light mode, white (#ffffff) in dark mode. Only ONE ink
 * entry exists — no separate black+white pair.
 */
export const WB_STROKE_PRESETS: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: WB_INK_ADAPTIVE_SENTINEL, label: "Ink" },
  { hex: "#6b7280", label: "Gray" },
  { hex: "#9ca3af", label: "Light gray" },
  { hex: "#ef4444", label: "Red" },
  { hex: "#f97316", label: "Orange" },
  { hex: "#3b82f6", label: "Blue" },
  { hex: "#22c55e", label: "Green" },
];

/**
 * Per-role laser pointer colors for Excalidraw collaborator rendering.
 * Tutor = coral accent (#e27d60 matches --accent); student = sky cyan.
 * Used by broadcastPointer (outbound) and useCollaboratorPointers (inbound render).
 */
export const WB_LASER_TUTOR_HEX = "#e27d60";
export const WB_LASER_STUDENT_HEX = "#0891b2";

/** Default stroke width presets (Excalidraw currentItemStrokeWidth). */
export const WB_STROKE_WIDTHS: ReadonlyArray<{ value: number; label: string; lineH: number }> = [
  { value: 0.5, label: "Hair", lineH: 1 },
  { value: 1, label: "Thin", lineH: 2 },
  { value: 2, label: "Med", lineH: 3 },
  { value: 4, label: "Thick", lineH: 5 },
];
