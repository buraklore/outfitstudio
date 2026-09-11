import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import Link from "next/link";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { t } from "@/lib/i18n";
import { getLocale } from "@/lib/locale-server";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: "Outfit Studio", description: t(locale).metaDescription };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const M = t(locale);
  return (
    <html lang={locale} className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh bg-paper font-sans text-ink">
        <header className="border-b border-hairline bg-paper/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5">
            <Link href="/" className="font-display text-xl tracking-tight">
              Outfit&nbsp;Studio
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/create"
                className="text-sm text-taupe transition-colors hover:text-ink"
              >
                {M.header.nav}
              </Link>
              <LocaleSwitcher current={locale} aria={M.switcher.aria} />
            </div>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mx-auto max-w-6xl px-5 py-10 text-xs text-taupe">{M.footer}</footer>
      </body>
    </html>
  );
}
