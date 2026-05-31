import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import { SiteFooter } from "@/components/SiteFooter";
import { ThemeInit } from "@/components/ThemeInit";
import { fraunces, inter, jetbrainsMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tutoring Notes",
  description: "Fast session notes and clean parent updates for tutors.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body style={{ minHeight: "100%", display: "flex", flexDirection: "column", margin: 0 }}>
        <ThemeInit />
        <Providers>
          <div style={{ flex: 1 }}>{children}</div>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}

