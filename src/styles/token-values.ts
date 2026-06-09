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
export const EXCALIDRAW_STROKE_HEX = "#1e293b";

/** Edge OG ImageResponse cannot resolve CSS variables. */
export const FAVICON_BRAND_BG = "#7c5cff";

/**
 * Stroke color presets for the Mynk whiteboard toolbar.
 * Excalidraw's currentItemStrokeColor requires resolved hex ΓÇö CSS vars cannot
 * be used here. Labels are for aria-label; display uses the actual color.
 */
export const WB_STROKE_PRESETS: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: "#1e293b", label: "Near-black" },
  { hex: "#ffffff", label: "White" },
  { hex: "#6b7280", label: "Gray" },
  { hex: "#9ca3af", label: "Light gray" },
  { hex: "#ef4444", label: "Red" },
  { hex: "#f97316", label: "Orange" },
  { hex: "#3b82f6", label: "Blue" },
  { hex: "#22c55e", label: "Green" },
];

/** Default stroke width presets (Excalidraw currentItemStrokeWidth). */
export const WB_STROKE_WIDTHS: ReadonlyArray<{ value: number; label: string; lineH: number }> = [
  { value: 0.5, label: "Hair", lineH: 1 },
  { value: 1, label: "Thin", lineH: 2 },
  { value: 2, label: "Med", lineH: 3 },
  { value: 4, label: "Thick", lineH: 5 },
];
