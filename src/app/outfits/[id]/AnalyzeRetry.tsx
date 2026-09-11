"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiClientError, requestOutfitAnalysis } from "@/lib/api-client";
import { Button, Spinner } from "@/components/ui";

/** Shown when a preview exists but the style analysis failed or is missing. */
export default function AnalyzeRetry({ outfitId }: { outfitId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await requestOutfitAnalysis(outfitId);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-hairline bg-white p-6">
      <p className="text-sm text-taupe">
        Your outfit preview is ready, but the style report hasn&rsquo;t been generated yet.
      </p>
      {error && <p className="mt-2 text-sm text-clay">{error}</p>}
      <Button className="mt-4" onClick={() => void run()} disabled={busy}>
        {busy && <Spinner />}
        {busy ? "Scoring your outfit…" : "Score this outfit"}
      </Button>
    </div>
  );
}
