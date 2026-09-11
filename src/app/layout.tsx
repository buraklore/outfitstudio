import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Outfit Studio",
  description: "Add clothing links or upload your clothes. We'll create the outfit for you.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink">
        <header className="border-b border-hairline bg-paper/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
            <Link href="/" className="font-display text-xl tracking-tight">
              Outfit&nbsp;Studio
            </Link>
            <Link
              href="/create"
              className="text-sm text-taupe transition-colors hover:text-ink"
            >
              Build an outfit
            </Link>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mx-auto max-w-6xl px-5 py-10 text-xs text-taupe">
          Outfit previews are AI-generated visualizations, not real product photos.
        </footer>
      </body>
    </html>
  );
}
