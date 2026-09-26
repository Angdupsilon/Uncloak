import type { Metadata } from "next";
import { Inter, Outfit, Geist_Mono } from "next/font/google";
import "./globals.css";

// UberMove / UberMoveText are proprietary. DESIGN.md's substitute path is Inter:
// weight 700 for display, 400/500 for text.
const inter = Inter({
  variable: "--font-sans-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Display face. Neuzeit Grotesk is a licensed Monotype family: not on Google
// Fonts and not installable from here, so it is referenced by name first (it
// will be used if a viewer has it, or once the team self-hosts the files) with
// Outfit as the web fallback - the closest free geometric grotesque in
// proportion and x-height.
const displayFont = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Uncloak: Texas data-center public records",
  description:
    "Search who is building data centers in Texas and where. Company and site profiles built from state public records, with every figure linked to its source.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${displayFont.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
