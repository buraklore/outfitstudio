"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  analyzeClothing,
  ApiClientError,
  createOutfit,
  extractProduct,
  generateOutfit,
  requestOutfitAnalysis,
  uploadImage,
} from "@/lib/api-client";
import { Badge, Button, Card, SectionLabel, Spinner } from "@/components/ui";
import { StepList, type Step, type StepState } from "@/components/StepList";
import {
  categoryLabel,
  errorMessage,
  mannequinLabel,
  presetLabel,
  t,
  warningText,
  type Locale,
} from "@/lib/i18n";
import {
  CLOTHING_CATEGORIES,
  slotForCategory,
  type ClothingCategory,
} from "@/types/clothing";
import {
  MANNEQUIN_TYPES,
  STYLE_PRESETS,
  type MannequinType,
  type StylePreset,
} from "@/types/outfit";
import type {
  AnalyzedItemDto,
  ExtractedProductDto,
  OutfitItemInputDto,
  UploadedImageDto,
} from "@/types/api";

type Mode = "links" | "upload";
type Phase = "input" | "processing" | "review" | "building";

interface LinkSlot {
  id: string;
  label: string;
  slotHint?: string;
  optional: boolean;
  url: string;
  status: "idle" | "loading" | "done" | "failed";
  error?: string;
  product?: ExtractedProductDto;
  fallbackUpload?: UploadedImageDto;
  uploading?: boolean;
}

interface UploadEntry {
  id: string;
  fileName: string;
  status: "uploading" | "done" | "failed";
  error?: string;
  data?: UploadedImageDto;
}

interface SourceMeta {
  source: "URL" | "UPLOAD";
  sourceUrl?: string;
  productSourceId?: string;
  brand?: string | null;
  price?: number | null;
  currency?: string | null;
}

interface ResolvedInput {
  imageKey: string;
  imageUrl: string;
  slotHint?: string;
  meta: SourceMeta;
}

interface ReviewItem {
  id: string;
  imageKey: string;
  imageUrl: string;
  meta: SourceMeta;
  analysis: AnalyzedItemDto;
  category: ClothingCategory;
  confirmed: boolean;
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function needsConfirmation(item: ReviewItem): boolean {
  return (item.analysis.confidence < 0.7 || !item.analysis.categoryMatched) && !item.confirmed;
}

export default function CreateFlow({ locale }: { locale: Locale }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode: Mode = searchParams.get("mode") === "upload" ? "upload" : "links";
  const M = t(locale).create;

  const initialSlots: LinkSlot[] = useMemo(
    () => [
      { id: "top", label: M.slotTop, slotHint: "top", optional: false, url: "", status: "idle" },
      {
        id: "bottom",
        label: M.slotBottom,
        slotHint: "bottom",
        optional: false,
        url: "",
        status: "idle",
      },
      {
        id: "shoes",
        label: M.slotShoes,
        slotHint: "shoes",
        optional: false,
        url: "",
        status: "idle",
      },
      {
        id: "outerwear",
        label: M.slotOuterwear,
        slotHint: "outerwear",
        optional: true,
        url: "",
        status: "idle",
      },
      {
        id: "accessory",
        label: M.slotAccessory,
        slotHint: "accessory",
        optional: true,
        url: "",
        status: "idle",
      },
    ],
    // Locale changes remount the page (server refresh), so this is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [mode, setMode] = useState<Mode>(initialMode);
  const [phase, setPhase] = useState<Phase>("input");
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [slots, setSlots] = useState<LinkSlot[]>(initialSlots);
  const [uploads, setUploads] = useState<UploadEntry[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [unidentified, setUnidentified] = useState<string[]>([]);
  const [mannequin, setMannequin] = useState<MannequinType>("NEUTRAL");
  const [preset, setPreset] = useState<StylePreset>("auto");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [collectState, setCollectState] = useState<StepState>("pending");
  const [analyzeState, setAnalyzeState] = useState<StepState>("pending");
  const [planState, setPlanState] = useState<StepState>("pending");
  const [previewState, setPreviewState] = useState<StepState>("pending");
  const [scoreState, setScoreState] = useState<StepState>("pending");
  const selectRefs = useRef(new Map<string, HTMLSelectElement>());

  const msg = (code: string, server?: string) => errorMessage(locale, code, server);
  const fromError = (e: unknown, fallbackCode: string) =>
    e instanceof ApiClientError ? msg(e.code, e.message) : msg(fallbackCode);

  const updateSlot = (id: string, patch: Partial<LinkSlot>) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  /* ------------------------------ links mode ------------------------------ */

  const addExtraSlot = () => {
    setSlots((prev) => [
      ...prev,
      {
        id: `extra-${newId()}`,
        label: `${M.slotExtra} ${prev.length + 1}`,
        optional: true,
        url: "",
        status: "idle",
      },
    ]);
  };

  const slotResolved = (s: LinkSlot) => Boolean(s.product || s.fallbackUpload);
  const slotFilled = (s: LinkSlot) => s.url.trim().length > 0 || slotResolved(s);

  async function handleSlotFallbackUpload(slot: LinkSlot, file: File) {
    updateSlot(slot.id, { uploading: true, error: undefined });
    try {
      const data = await uploadImage(file);
      updateSlot(slot.id, {
        uploading: false,
        fallbackUpload: data,
        status: "done",
        error: undefined,
      });
    } catch (e) {
      updateSlot(slot.id, { uploading: false, error: fromError(e, "IMAGE_UNREADABLE") });
    }
  }

  async function handleContinueLinks() {
    setGlobalError(null);
    const snapshot = slots;
    const filled = snapshot.filter(slotFilled);
    if (filled.length < 2) {
      setGlobalError(M.minTwo);
      return;
    }
    setPhase("processing");
    setCollectState("active");
    setAnalyzeState("pending");

    // Local product map: async flows must not re-read React state mid-run.
    const productMap = new Map<string, ExtractedProductDto>();
    for (const s of snapshot) if (s.product) productMap.set(s.id, s.product);

    const pending = snapshot.filter((s) => slotFilled(s) && !slotResolved(s));
    const results = await Promise.all(
      pending.map(async (slot) => {
        updateSlot(slot.id, { status: "loading", error: undefined });
        try {
          const product = await extractProduct(slot.url.trim());
          productMap.set(slot.id, product);
          updateSlot(slot.id, { status: "done", product });
          return true;
        } catch (e) {
          updateSlot(slot.id, { status: "failed", error: fromError(e, "URL_FETCH_FAILED") });
          return false;
        }
      }),
    );

    if (results.some((okay) => !okay)) {
      // Spec §6/§22 — failed links fall back to a per-slot image upload.
      setCollectState("pending");
      setPhase("input");
      setGlobalError(M.someFailed);
      return;
    }

    setCollectState("done");
    const resolved: ResolvedInput[] = [];
    for (const slot of snapshot) {
      const product = productMap.get(slot.id);
      if (product) {
        resolved.push({
          imageKey: product.imageKey,
          imageUrl: product.imageUrl,
          slotHint: slot.slotHint,
          meta: {
            source: "URL",
            sourceUrl: product.sourceUrl,
            productSourceId: product.productSourceId,
            brand: product.brand,
            price: product.price,
            currency: product.currency,
          },
        });
      } else if (slot.fallbackUpload) {
        resolved.push({
          imageKey: slot.fallbackUpload.imageKey,
          imageUrl: slot.fallbackUpload.url,
          slotHint: slot.slotHint,
          meta: { source: "UPLOAD" },
        });
      }
    }
    await runAnalysis(resolved);
  }

  /* ------------------------------ upload mode ----------------------------- */

  async function handleFilesSelected(files: FileList | null) {
    if (!files) return;
    setGlobalError(null);
    for (const file of Array.from(files)) {
      const id = newId();
      setUploads((prev) => [...prev, { id, fileName: file.name || "photo", status: "uploading" }]);
      try {
        const data = await uploadImage(file);
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, status: "done", data } : u)));
      } catch (e) {
        setUploads((prev) =>
          prev.map((u) =>
            u.id === id ? { ...u, status: "failed", error: fromError(e, "IMAGE_UNREADABLE") } : u,
          ),
        );
      }
    }
  }

  async function handleContinueUploads() {
    setGlobalError(null);
    const done = uploads.filter((u) => u.status === "done" && u.data);
    if (done.length < 1) {
      setGlobalError(M.minOneUpload);
      return;
    }
    setPhase("processing");
    setCollectState("done");
    const resolved: ResolvedInput[] = done.map((u) => ({
      imageKey: u.data!.imageKey,
      imageUrl: u.data!.url,
      meta: { source: "UPLOAD" },
    }));
    await runAnalysis(resolved);
  }

  /* ---------------------------- shared pipeline ---------------------------- */

  async function runAnalysis(inputs: ResolvedInput[]) {
    setAnalyzeState("active");
    try {
      const res = await analyzeClothing(
        inputs.map((i) => ({ imageKey: i.imageKey, slotHint: i.slotHint })),
        locale,
      );
      const items: ReviewItem[] = [];
      const failedImages: string[] = [];
      for (const result of res.results) {
        const input = inputs.find((i) => i.imageKey === result.imageKey);
        // Slot-hinted photos (Top/Bottom/Shoes…) often show a model wearing
        // OTHER garments too. Keep only the garment(s) matching the hinted
        // slot so stray pieces never leak into the outfit; keep everything
        // when nothing matches or when there is no hint (free uploads).
        let kept = result.items;
        if (input?.slotHint) {
          const matching = result.items.filter(
            (it) => slotForCategory(it.category) === input.slotHint,
          );
          if (matching.length > 0) kept = matching;
        }
        if (kept.length === 0) {
          failedImages.push(input?.meta.sourceUrl ?? M.yourPhoto);
          continue;
        }
        for (const analysis of kept) {
          items.push({
            id: newId(),
            imageKey: result.imageKey,
            imageUrl: result.imageUrl,
            meta: input?.meta ?? { source: "UPLOAD" },
            analysis,
            category: analysis.category,
            confirmed: false,
          });
        }
      }
      if (items.length === 0) {
        setAnalyzeState("pending");
        setPhase("input");
        setGlobalError(msg("CLOTHING_NOT_DETECTED"));
        return;
      }
      setAnalyzeState("done");
      setReviewItems(items);
      setUnidentified(failedImages);
      setPhase("review");
    } catch (e) {
      setAnalyzeState("error");
      setPhase("input");
      setGlobalError(fromError(e, "CLOTHING_NOT_DETECTED"));
    }
  }

  const pendingConfirmations = useMemo(
    () => reviewItems.filter(needsConfirmation).length,
    [reviewItems],
  );

  /** Duplicate-slot notice (e.g. two bottoms, two pairs of shoes). */
  const duplicateNotice = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of reviewItems) {
      const slot = slotForCategory(item.category);
      counts.set(slot, (counts.get(slot) ?? 0) + 1);
    }
    const parts: string[] = [];
    const bottoms = counts.get("bottom") ?? 0;
    const shoes = counts.get("shoes") ?? 0;
    if (bottoms > 1) parts.push(M.dupBottom(bottoms));
    if (shoes > 1) parts.push(M.dupShoes(shoes));
    return parts.length > 0 ? parts : null;
  }, [reviewItems, M]);

  function patchReviewItem(id: string, patch: Partial<ReviewItem>) {
    setReviewItems((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function handleGenerate() {
    setGlobalError(null);
    if (reviewItems.length < 2) {
      setGlobalError(M.keepTwo);
      return;
    }
    setPhase("building");
    setPlanState("active");
    setPreviewState("pending");
    setScoreState("pending");

    const payload: OutfitItemInputDto[] = reviewItems.map((item) => ({
      imageKey: item.imageKey,
      category: item.category,
      source: item.meta.source,
      sourceUrl: item.meta.sourceUrl,
      productSourceId: item.meta.productSourceId,
      subcategory: item.analysis.subcategory,
      color: item.analysis.color,
      secondaryColors: item.analysis.secondaryColors,
      pattern: item.analysis.pattern,
      material: item.analysis.material,
      fit: item.analysis.fit,
      style: item.analysis.style,
      season: item.analysis.season,
      formality: item.analysis.formality,
      genderPresentation: item.analysis.genderPresentation,
      description: item.analysis.description,
      confidence: item.analysis.confidence,
    }));

    let outfitId: string;
    try {
      const created = await createOutfit({
        items: payload,
        mannequinType: mannequin,
        stylePreset: preset,
        locale,
      });
      outfitId = created.id;
      setWarnings(created.warnings.map((code) => warningText(locale, code)));
      setPlanState("done");
    } catch (e) {
      setPlanState("error");
      setPhase("review");
      setGlobalError(fromError(e, "INTERNAL"));
      return;
    }

    setPreviewState("active");
    try {
      await generateOutfit(outfitId);
      setPreviewState("done");
    } catch (e) {
      setPreviewState("error");
      setPhase("review");
      setGlobalError(fromError(e, "GENERATION_FAILED"));
      return;
    }

    setScoreState("active");
    try {
      await requestOutfitAnalysis(outfitId);
      setScoreState("done");
    } catch {
      // The preview exists; the result page offers a retry for the analysis.
      setScoreState("error");
    }
    router.push(`/outfits/${outfitId}`);
  }

  /* --------------------------------- render -------------------------------- */

  const processingSteps: Step[] = [
    { id: "collect", label: M.stepCollect, state: collectState },
    { id: "analyze", label: M.stepAnalyze, state: analyzeState },
  ];
  const buildingSteps: Step[] = [
    { id: "plan", label: M.stepPlan, state: planState },
    { id: "preview", label: M.stepPreview, state: previewState },
    { id: "score", label: M.stepScore, state: scoreState },
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <SectionLabel>{M.eyebrow}</SectionLabel>
      <h1 className="mt-2 font-display text-4xl tracking-tight">
        {phase === "review" ? M.titleReview : M.titleAdd}
      </h1>
      <p className="mt-2 text-sm text-taupe">{phase === "review" ? M.subReview : M.subAdd}</p>

      {globalError && (
        <div className="mt-6 rounded-xl border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay">
          {globalError}
        </div>
      )}

      {phase === "input" && (
        <>
          <div className="mt-8 inline-flex rounded-full border border-hairline bg-white p-1 text-sm">
            {(["links", "upload"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setGlobalError(null);
                }}
                className={
                  mode === m
                    ? "rounded-full bg-moss px-4 py-1.5 font-medium text-paper"
                    : "rounded-full px-4 py-1.5 text-taupe hover:text-ink"
                }
              >
                {m === "links" ? M.tabLinks : M.tabUpload}
              </button>
            ))}
          </div>

          {mode === "links" ? (
            <div className="mt-6 space-y-4">
              {slots.map((slot) => (
                <Card key={slot.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <label htmlFor={`slot-${slot.id}`} className="text-sm font-medium text-ink">
                      {slot.label}
                      {slot.optional && (
                        <span className="ml-2 text-xs font-normal text-taupe">{M.optional}</span>
                      )}
                    </label>
                    {slot.status === "done" && <Badge tone="moss">{M.ready}</Badge>}
                    {slot.status === "loading" && <Spinner className="text-taupe" />}
                  </div>

                  {slot.fallbackUpload || slot.product ? (
                    <div className="mt-3 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={slot.product?.imageUrl ?? slot.fallbackUpload?.url}
                        alt={slot.label}
                        className="size-16 rounded-lg border border-hairline object-cover"
                      />
                      <div className="min-w-0 text-sm">
                        <p className="truncate text-ink">
                          {slot.product?.title ?? M.uploadedImage}
                        </p>
                        <p className="text-xs text-taupe">
                          {slot.product
                            ? `${slot.product.brand ?? slot.product.domain}${
                                slot.product.price != null
                                  ? ` · ${slot.product.price} ${slot.product.currency ?? ""}`
                                  : ""
                              }`
                            : M.yourPhoto}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateSlot(slot.id, {
                            product: undefined,
                            fallbackUpload: undefined,
                            status: "idle",
                            url: "",
                            error: undefined,
                          })
                        }
                        className="ml-auto text-xs text-taupe hover:text-clay"
                      >
                        {M.remove}
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        id={`slot-${slot.id}`}
                        type="url"
                        inputMode="url"
                        placeholder={M.urlPlaceholder}
                        value={slot.url}
                        onChange={(e) =>
                          updateSlot(slot.id, { url: e.target.value, error: undefined })
                        }
                        className="mt-3 w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-moss"
                      />
                      {slot.error && (
                        <div className="mt-3 rounded-lg bg-amber-soft px-3 py-2.5 text-sm text-amber-ink">
                          <p>{slot.error}</p>
                          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-moss">
                            {slot.uploading ? <Spinner /> : null}
                            {slot.uploading ? M.uploading : M.uploadInstead}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/avif"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void handleSlotFallbackUpload(slot, file);
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </>
                  )}
                </Card>
              ))}
              <button
                type="button"
                onClick={addExtraSlot}
                className="text-sm font-medium text-moss hover:underline"
              >
                {M.addAnother}
              </button>
              <div className="pt-2">
                <Button onClick={() => void handleContinueLinks()}>{M.analyzeBtn}</Button>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-hairline bg-white px-6 py-12 text-center transition-colors hover:border-moss">
                <span className="font-display text-xl">{M.dropTitle}</span>
                <span className="text-sm text-taupe">{M.dropSub}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handleFilesSelected(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>

              {uploads.length > 0 && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {uploads.map((u) => (
                    <div
                      key={u.id}
                      className="relative overflow-hidden rounded-xl border border-hairline bg-white"
                    >
                      {u.data ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.data.url}
                          alt={u.fileName}
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center">
                          {u.status === "uploading" ? (
                            <Spinner className="text-taupe" />
                          ) : (
                            <span className="px-2 text-center text-xs text-clay">{u.error}</span>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setUploads((prev) => prev.filter((x) => x.id !== u.id))}
                        className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 px-2 py-0.5 text-xs text-paper"
                        aria-label={`${M.remove}: ${u.fileName}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="pt-2">
                <Button onClick={() => void handleContinueUploads()}>{M.analyzeBtn}</Button>
              </div>
            </div>
          )}
        </>
      )}

      {phase === "processing" && (
        <Card className="mt-8 p-6">
          <StepList steps={processingSteps} />
        </Card>
      )}

      {phase === "review" && (
        <div className="mt-8 space-y-6">
          {unidentified.length > 0 && (
            <div className="rounded-xl bg-amber-soft px-4 py-3 text-sm text-amber-ink">
              {msg("CLOTHING_NOT_DETECTED")}{" "}
              <span className="text-amber-ink/80">
                ({M.skipped}: {unidentified.join(", ")})
              </span>
            </div>
          )}

          {duplicateNotice && (
            <div className="rounded-xl bg-amber-soft px-4 py-3 text-sm text-amber-ink">
              {M.dupTitle} {duplicateNotice.join(", ")}. {M.dupNote}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {reviewItems.map((item) => {
              const flagged = needsConfirmation(item);
              return (
                <Card key={item.id} className="overflow-hidden">
                  <div className="flex gap-3 p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.imageUrl}
                      alt={item.analysis.description ?? categoryLabel(locale, item.category)}
                      className="size-20 shrink-0 rounded-lg border border-hairline object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs uppercase tracking-wide text-taupe">
                          {item.meta.source === "URL" ? M.originalProduct : M.yourPhoto}
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            setReviewItems((prev) => prev.filter((r) => r.id !== item.id))
                          }
                          className="text-xs text-taupe hover:text-clay"
                        >
                          {M.remove}
                        </button>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-ink">
                        {item.analysis.description || categoryLabel(locale, item.category)}
                      </p>
                      {(item.meta.brand || item.meta.price != null) && (
                        <p className="mt-0.5 text-xs text-taupe">
                          {item.meta.brand}
                          {item.meta.price != null &&
                            ` · ${item.meta.price} ${item.meta.currency ?? ""}`}
                        </p>
                      )}
                      <select
                        ref={(el) => {
                          if (el) selectRefs.current.set(item.id, el);
                          else selectRefs.current.delete(item.id);
                        }}
                        value={item.category}
                        onChange={(e) =>
                          patchReviewItem(item.id, {
                            category: e.target.value as ClothingCategory,
                            confirmed: true,
                          })
                        }
                        className="mt-2 w-full rounded-lg border border-hairline bg-paper px-2.5 py-1.5 text-sm outline-none focus:border-moss"
                        aria-label={M.categoryAria}
                      >
                        {CLOTHING_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {categoryLabel(locale, c)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {flagged && (
                    <div className="border-t border-hairline bg-amber-soft px-4 py-3 text-sm text-amber-ink">
                      <p>
                        {M.confirmAsk(
                          [item.analysis.color, categoryLabel(locale, item.category)]
                            .filter(Boolean)
                            .join(" "),
                        )}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="secondary"
                          className="!px-3 !py-1 text-xs"
                          onClick={() => patchReviewItem(item.id, { confirmed: true })}
                        >
                          {M.correct}
                        </Button>
                        <Button
                          variant="ghost"
                          className="!px-3 !py-1 text-xs"
                          onClick={() => {
                            const el = selectRefs.current.get(item.id);
                            el?.focus();
                          }}
                        >
                          {M.changeCategory}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <Card className="space-y-5 p-5">
            <div>
              <SectionLabel>{M.mannequin}</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {MANNEQUIN_TYPES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMannequin(m)}
                    className={
                      mannequin === m
                        ? "rounded-full bg-moss px-4 py-1.5 text-sm font-medium text-paper"
                        : "rounded-full border border-hairline bg-white px-4 py-1.5 text-sm text-taupe hover:text-ink"
                    }
                  >
                    {mannequinLabel(locale, m)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <SectionLabel>{M.preset}</SectionLabel>
              <div className="mt-2 flex flex-wrap gap-2">
                {STYLE_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(p)}
                    className={
                      preset === p
                        ? "rounded-full bg-moss px-4 py-1.5 text-sm font-medium text-paper"
                        : "rounded-full border border-hairline bg-white px-4 py-1.5 text-sm text-taupe hover:text-ink"
                    }
                  >
                    {presetLabel(locale, p)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-taupe">{M.presetNote}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-4">
              <Button
                onClick={() => void handleGenerate()}
                disabled={pendingConfirmations > 0 || reviewItems.length < 2}
              >
                {M.generate}
              </Button>
              {pendingConfirmations > 0 && (
                <span className="text-sm text-taupe">{M.confirmPending(pendingConfirmations)}</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setPhase("input");
                  setCollectState("pending");
                  setAnalyzeState("pending");
                }}
                className="text-sm text-taupe hover:text-ink"
              >
                {M.back}
              </button>
            </div>
          </Card>
        </div>
      )}

      {phase === "building" && (
        <Card className="mt-8 p-6">
          <StepList steps={buildingSteps} />
          {warnings.length > 0 && (
            <p className="mt-4 text-xs text-taupe">{warnings.join(" · ")}</p>
          )}
          <p className="mt-4 text-xs text-taupe">{M.buildingHonesty}</p>
        </Card>
      )}
    </div>
  );
}
