import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import { Backdrop } from "@/components/layout/Backdrop";
import { DataBootstrap } from "@/components/layout/DataBootstrap";
import { ScenarioConsole } from "@/components/layout/ScenarioConsole";
import { ScenarioUrlSync } from "@/components/layout/ScenarioUrlSync";
import { Spotlight } from "@/components/layout/Spotlight";
import { TopNav } from "@/components/layout/TopNav";
import { PlaceholderBanner } from "@/components/ui/PlaceholderBanner";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/** Display face for headings and hero numbers (CR-003). */
const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fresh Control Tower",
  description:
    "Prototype: AI replenishment for UAE fresh grocery that recovers hidden demand, plans for festivals and spikes, and sources under disruption. The operator is fictional and every number carries a provenance label.",
};

export const viewport: Viewport = {
  themeColor: "#030305",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Backdrop />
        <a href="#main" className="skip-link">Skip to content</a>
        {/* Horizontal top navigation only: there is no sidebar anywhere (docs/design-system.md §2). */}
        <TopNav />
        <ScenarioConsole />
        <ScenarioUrlSync />
        <DataBootstrap />
        <Spotlight />
        <div className="page-shell">
          <PlaceholderBanner />
        </div>
        <main id="main" className="page-shell">
          {children}
        </main>
      </body>
    </html>
  );
}
