import { cacheGet, cacheKey, cacheSet } from "@/lib/cache";
import {
  generateStructured,
  getModels,
  imageBlockFromBuffer,
  textBlock,
  type AiBlock,
} from "@/services/gemini/client";
import { sha256, toAiInputImage } from "@/services/image-processing";
import {
  CLOTHING_ANALYSIS_JSON_SCHEMA,
  clothingAnalysisResponseSchema,
  type RawClothingItem,
} from "@/services/clothing-analysis/schema";
import {
  CLOTHING_CATEGORIES,
  normalizeCategory,
  type ClothingAttributes,
} from "@/types/clothing";
import type { AnalyzedItemDto } from "@/types/api";

const PROMPT_VERSION = "v2";
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const ANALYSIS_SEED = 7;

type CachedItem = ClothingAttributes & { categoryMatched: boolean };

const LANGUAGE_NAMES: Record<string, string> = { tr: "Turkish", en: "English" };

function buildSystemPrompt(locale: string): string {
  const language = LANGUAGE_NAMES[locale] ?? "Turkish";
  return `You are a meticulous fashion product analyst.
You receive one photo that contains one or more clothing items or accessories.
Identify EVERY distinct garment or accessory in the photo and return them in the "items" array. Return an empty array if none are clearly visible.

Rules:
- "category" MUST be exactly one of these ENGLISH keys, unchanged: ${CLOTHING_CATEGORIES.join(", ")}.
- ALL free-text fields — "description", "color", "secondaryColors", "pattern", "material", "fit", "style" — must be written in ${language}.
- If the photo shows a person wearing clothes, describe only the garments, never the person.
- Name the primary color in simple ${language} words and up to 4 secondary colors.
- "pattern" describes the print in ${language}; use the ${language} word for "plain" when there is none.
- Fabric cannot be verified from a photo: phrase "material" with hedged ${language} wording (the equivalent of "appears to be cotton"). Never state a material as a fact.
- "description" is one factual ${language} sentence with the visual details needed to faithfully reproduce this exact item (color, cut, closures, prints, hardware).
- "confidence" is your honest 0-1 certainty about the category identification.
- Never invent details you cannot see.`;
}

export interface ClothingAnalysisInput {
  buffer: Buffer;
  imageKey: string;
  imageUrl: string;
  slotHint?: string;
  /** Language of the free-text fields ("tr" default). */
  locale?: string;
}

/**
 * Vision analysis of one uploaded/extracted image (spec §7). Results are
 * cached by content hash so the same image never hits Gemini twice (§27).
 */
export async function analyzeClothingImage(
  input: ClothingAnalysisInput,
): Promise<AnalyzedItemDto[]> {
  const aiImage = await toAiInputImage(input.buffer);
  const hash = sha256(aiImage.buffer);
  const models = getModels();
  const locale = input.locale === "en" ? "en" : "tr";
  const key = cacheKey(
    "clothing-analysis",
    PROMPT_VERSION,
    models.vision,
    hash,
    input.slotHint ?? "",
    locale,
  );

  const cached = await cacheGet<CachedItem[]>(key);
  const items =
    cached ?? (await runAnalysis(aiImage.buffer, models.vision, locale, input.slotHint));
  if (!cached) await cacheSet(key, "clothing-analysis", items, CACHE_TTL_SECONDS);

  return items.map((item) => ({ ...item, imageKey: input.imageKey, imageUrl: input.imageUrl }));
}

async function runAnalysis(
  jpeg: Buffer,
  model: string,
  locale: string,
  slotHint?: string,
): Promise<CachedItem[]> {
  const blocks: AiBlock[] = [
    imageBlockFromBuffer(jpeg, "image/jpeg"),
    textBlock(
      slotHint
        ? `Analyze this photo. The user placed it in the "${slotHint}" slot — treat that only as a weak prior, not as ground truth.`
        : "Analyze this photo.",
    ),
  ];

  const parsed = await generateStructured({
    model,
    input: blocks,
    system: buildSystemPrompt(locale),
    schema: CLOTHING_ANALYSIS_JSON_SCHEMA,
    zodSchema: clothingAnalysisResponseSchema,
    seed: ANALYSIS_SEED,
    maxOutputTokens: 2048,
  });

  return parsed.items.map(toAttributes);
}

export function toAttributes(raw: RawClothingItem): CachedItem {
  const { category, matched } = normalizeCategory(raw.category);
  const confidence = matched ? raw.confidence : Math.min(raw.confidence, 0.4);
  return {
    category,
    subcategory: raw.subcategory ?? null,
    color: raw.color,
    secondaryColors: raw.secondaryColors,
    pattern: raw.pattern,
    material: raw.material ?? null,
    fit: raw.fit ?? null,
    style: raw.style ?? null,
    season: raw.season ?? null,
    formality: raw.formality ?? null,
    genderPresentation: raw.genderPresentation ?? null,
    description: raw.description,
    confidence,
    categoryMatched: matched,
  };
}
