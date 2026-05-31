import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";

/** Wordmark, headings, AI prose — SOFT + opsz axes required for brand typography. */
export const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "opsz"],
  weight: ["400", "700"],
  display: "swap",
});

/** Body / UI chrome — V2 body weight 400. */
export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500"],
  display: "swap",
});

/** Labels, timestamps, eyebrows, tabular numerals. */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
  display: "swap",
});
