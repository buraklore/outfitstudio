"use client";

import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALES, type Locale } from "@/lib/i18n";

/** TR/EN pills. Sets the cookie and re-renders the server tree. */
export default function LocaleSwitcher({ current, aria }: { current: Locale; aria: string }) {
  const router = useRouter();
  function setLocale(next: Locale) {
    if (next === current) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }
  return (
    <div
      role="group"
      aria-label={aria}
      className="inline-flex rounded-full border border-hairline bg-white p-0.5 text-xs"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          className={
            current === l
              ? "rounded-full bg-moss px-2.5 py-1 font-medium text-paper"
              : "rounded-full px-2.5 py-1 text-taupe hover:text-ink"
          }
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
