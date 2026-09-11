import Link from "next/link";
import { notFound } from "next/navigation";
import { getUserIdIfExists } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toOutfitDto } from "@/services/outfit-serializer";
import { Badge, SectionLabel } from "@/components/ui";
import { criterionLabel, slotLabel as slotName, t } from "@/lib/i18n";
import AnalyzeRetry from "./AnalyzeRetry";
import type { ImprovementDto } from "@/types/api";

export const dynamic = "force-dynamic";

const ACTION_GLYPHS: Record<ImprovementDto["action"], { glyph: string; cls: string }> = {
  add: { glyph: "+", cls: "text-moss" },
  swap: { glyph: "⇄", cls: "text-ink" },
  adjust: { glyph: "±", cls: "text-taupe" },
  avoid: { glyph: "−", cls: "text-clay" },
};

export default async function OutfitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await getUserIdIfExists();
  const outfit = await prisma.outfit.findUnique({
    where: { id },
    include: {
      items: {
        include: { clothingItem: { include: { productSource: true } } },
        orderBy: { position: "asc" },
      },
      analysis: true,
    },
  });
  if (!outfit || (outfit.userId && outfit.userId !== userId)) notFound();

  const dto = toOutfitDto(outfit);
  // The result renders in the language chosen at creation time.
  const locale = dto.locale;
  const M = t(locale).result;
  const analysis = dto.analysis;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* ------------------------------ preview ------------------------------ */}
        <div className="lg:sticky lg:top-8 lg:self-start">
          <div className="overflow-hidden rounded-3xl border border-hairline bg-white">
            {dto.generatedImageUrl ? (
              <a href={dto.generatedImageUrl} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={dto.generatedImageUrl}
                  alt={M.aiPreview}
                  className="aspect-[3/4] w-full object-cover"
                />
              </a>
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center p-8 text-center text-sm text-taupe">
                {dto.status === "FAILED" ? M.previewFailed : M.previewPreparing}
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Badge tone="moss">{M.aiPreview}</Badge>
            <span className="text-xs text-taupe">{M.notReal}</span>
          </div>
          {dto.status === "FAILED" && (
            <Link
              href="/create"
              className="mt-4 inline-block text-sm font-medium text-moss hover:underline"
            >
              {M.startOver}
            </Link>
          )}
        </div>

        {/* ------------------------------ report ------------------------------- */}
        <div>
          <SectionLabel>{M.yourOutfit}</SectionLabel>

          {analysis ? (
            <>
              <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
                <p className="font-display text-7xl leading-none tracking-tight md:text-8xl">
                  {analysis.overallScore}
                  <span className="text-3xl text-taupe md:text-4xl">/100</span>
                </p>
                <p className="pb-1 font-display text-2xl text-moss md:text-3xl">
                  {analysis.label}
                </p>
              </div>

              {(analysis.detectedStyles.length > 0 || analysis.dominantColors.length > 0) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {analysis.detectedStyles.map((s) => (
                    <Badge key={s} tone="moss">
                      {s}
                    </Badge>
                  ))}
                  {analysis.dominantColors.map((c) => (
                    <Badge key={c}>{c}</Badge>
                  ))}
                </div>
              )}

              <p className="mt-5 max-w-xl leading-relaxed text-ink">{analysis.styleComment}</p>

              <section className="mt-10">
                <SectionLabel>{M.breakdown}</SectionLabel>
                <div className="mt-4 space-y-4">
                  {analysis.breakdown.map((entry) => (
                    <div key={entry.key}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">
                          {criterionLabel(locale, entry.key, entry.label)}
                        </span>
                        <span className="tabular-nums text-taupe">
                          {entry.score}
                          <span className="text-taupe/70"> / {entry.maxScore}</span>
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-hairline">
                        <div
                          className="h-full rounded-full bg-moss"
                          style={{
                            width: `${Math.round((entry.score / entry.maxScore) * 100)}%`,
                          }}
                        />
                      </div>
                      {entry.reasoning && (
                        <p className="mt-1.5 text-xs leading-relaxed text-taupe">
                          {entry.reasoning}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="mt-10">
                <SectionLabel>{M.whyItWorks}</SectionLabel>
                <p className="mt-3 max-w-xl leading-relaxed text-ink">{analysis.whyItWorks}</p>
              </section>

              {analysis.improvements.length > 0 && (
                <section className="mt-10">
                  <SectionLabel>{M.improve}</SectionLabel>
                  <ul className="mt-3 space-y-2.5">
                    {analysis.improvements.map((imp, i) => {
                      const meta = ACTION_GLYPHS[imp.action] ?? ACTION_GLYPHS.adjust;
                      return (
                        <li key={i} className="flex gap-3 text-sm leading-relaxed">
                          <span className={`w-4 shrink-0 text-center font-medium ${meta.cls}`}>
                            {meta.glyph}
                          </span>
                          <span>{imp.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {analysis.suggestedOutfit && (
                <section className="mt-10 rounded-2xl border border-moss/25 bg-moss-soft/60 p-5">
                  <SectionLabel>{M.suggested}</SectionLabel>
                  <p className="mt-3 max-w-xl leading-relaxed text-ink">
                    {analysis.suggestedOutfit.summary}
                  </p>
                  {analysis.suggestedOutfit.items.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {analysis.suggestedOutfit.items.map((piece) => (
                        <Badge key={piece} tone="moss">
                          {piece}
                        </Badge>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {analysis.bestFor.length > 0 && (
                <section className="mt-10">
                  <SectionLabel>{M.bestFor}</SectionLabel>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {analysis.bestFor.map((occasion) => (
                      <Badge key={occasion}>{occasion}</Badge>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : dto.generatedImageUrl ? (
            <div className="mt-4">
              <AnalyzeRetry outfitId={dto.id} locale={locale} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-taupe">{M.scoreNote}</p>
          )}

          {/* --------------------------- original items --------------------------- */}
          <section className="mt-12 border-t border-hairline pt-8">
            <SectionLabel>{M.originalProducts}</SectionLabel>
            <p className="mt-1 text-xs text-taupe">{M.originalCaption}</p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {dto.items.map((item) => (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-hairline bg-white"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.imageUrl}
                    alt={item.description ?? item.category}
                    className="aspect-square w-full object-cover"
                  />
                  <div className="p-3">
                    <p className="text-xs uppercase tracking-wide text-taupe">
                      {slotName(locale, item.slot)}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm">
                      {item.description ?? item.category.replace(/-/g, " ")}
                    </p>
                    {(item.brand || item.price != null) && (
                      <p className="mt-0.5 text-xs text-taupe">
                        {item.brand}
                        {item.price != null && ` · ${item.price} ${item.currency ?? ""}`}
                      </p>
                    )}
                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer nofollow"
                        className="mt-1 inline-block text-xs font-medium text-moss hover:underline"
                      >
                        {M.viewProduct}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-10">
            <Link
              href="/create"
              className="inline-flex items-center gap-2 rounded-full bg-moss px-5 py-2.5 text-sm font-medium text-paper transition-colors hover:bg-ink"
            >
              {M.buildAnother}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
