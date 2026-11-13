import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fresh Control Tower",
  description:
    "Prototype: AI replenishment for UAE fresh grocery that recovers hidden demand, plans for festivals and spikes, and sources under disruption. The operator is fictional and every number carries a provenance label.",
};

export const viewport: Viewport = {
  themeColor: "#0a1018",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
