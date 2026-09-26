import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

// UberMove / UberMoveText are proprietary. DESIGN.md's substitute path is Inter:
// weight 700 for display, 400/500 for text, with the ss01 stylistic set enabled
// to get closest to UberMove's geometric letterforms.
const inter = Inter({
  variable: "--font-sans-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GridSight",
  description: "Live intelligence on Texas data-center electricity demand",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
