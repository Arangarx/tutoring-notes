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
