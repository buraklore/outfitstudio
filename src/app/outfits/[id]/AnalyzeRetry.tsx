"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, requestOutfitAnalysis } from "@/lib/api-client";
import { Button, Spinner } from "@/components/ui";
import { errorMessage, t, type Locale } from "@/lib/i18n";

/** Shown when a preview exists but the style analysis failed or is missing. */
export default function AnalyzeRetry({ outfitId, locale }: { outfitId: string; locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const M = t(locale).result;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await requestOutfitAnalysis(outfitId);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof ApiClientError
          ? errorMessage(locale, e.code, e.message)
          : errorMessage(locale, "default"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-hairline bg-white p-6">
      <p className="text-sm text-taupe">{M.analyzePendingText}</p>
      {error && <p className="mt-2 text-sm text-clay">{error}</p>}
      <Button className="mt-4" onClick={() => void run()} disabled={busy}>
        {busy && <Spinner />}
        {busy ? M.analyzeBusy : M.analyzeBtn}
      </Button>
    </div>
  );
}
