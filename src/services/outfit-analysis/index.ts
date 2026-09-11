import { AppError } from "@/lib/errors";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  generateStructured,
  getModels,
  imageBlockFromBuffer,
  textBlock,
  type AiBlock,
} from "@/services/gemini/client";
import { toAiInputImage } from "@/services/image-processing";
import { getStorage } from "@/services/storage";
import {
  OUTFIT_ANALYSIS_JSON_SCHEMA,
  outfitAnalysisResponseSchema,
  type OutfitAnalysisResponse,
} from "@/services/outfit-analysis/schema";
import {
  calculateOutfitScore,
  SCORE_CRITERIA,
  type RawBreakdown,
} from "@/services/outfit-analysis/scoring";
import { SLOT_LABELS, type OutfitSlot } from "@/types/clothing";
import type { ImprovementDto, OutfitAnalysisDto } from "@/types/api";

const PROMPT_VERSION = "v1";
const ANALYSIS_SEED = 7;

const LANGUAGE_NAMES: Record<string, string> = { tr: "Turkish", en: "English" };

function buildSystemPrompt(language: string): string {
  const criteriaLines = SCORE_CRITERIA.map(
    (c) => `- ${c.key} (0-${c.max}): ${CRITERIA_GUIDANCE[c.key]}`,
  ).join("\n");
  return `You are an objective fashion stylist scoring ONE outfit against a FIXED rubric.
Do not score on personal taste alone. Evaluate objective color harmony, silhouette balance, style consistency, occasion appropriateness and visual coherence.

Score every criterion from 0 to its maximum:
${criteriaLines}

Scoring anchors (apply them consistently — identical inputs must receive identical scores):
- 90-100 total: exceptional, editorial-level coherence
- 75-89: strong outfit with minor refinements possible
- 60-74: decent but with visible issues
- below 60: clear mismatches in color, style or proportion

You will see an AI-generated mannequin preview of the full outfit AND the original product photos of each item. When the preview and the originals conflict, trust the ORIGINAL product photos — the preview is only a visualization.

Write "styleComment" (a short, high-quality stylist paragraph: strongest aspect, overall character, one thing to refine), "whyItWorks", 2-5 "improvements" (each tagged add/swap/adjust/avoid, concrete and actionable) and 2-4 "bestFor" occasions in ${language}. Keep per-criterion "reasoning" in ${language} too, one or two objective sentences each.
"detectedStyles" must come from the allowed list; "dominantColors" are the outfit's main colors as simple ${language} color words.
Never invent product details you cannot see; if a material is uncertain, phrase it as an appearance ("appears to be…").`;
}

const CRITERIA_GUIDANCE: Record<string, string> = {
  colorHarmony: "main and secondary colors, contrast level, overall color balance",
  styleConsistency: "do all pieces speak the same style language (casual, formal, streetwear…)",
  fitAndProportion: "silhouette balance between pieces (e.g. oversized top with slim bottom)",
  itemCompatibility:
    "pairwise harmony: top+bottom, bottom+shoes, outerwear+top, accessories+the whole look",
  occasionSuitability: "how clearly the outfit fits identifiable occasions",
  visualBalance: "visual weight distribution, proportions, focal point",
  fashionImpact: "current trend relevance without being costume-like",
  versatility: "how many contexts and seasons the outfit can serve",
};

/**
 * Outfit analysis pipeline (spec §12/§13/§36/§37): sends the generated
 * preview plus every original product photo to Gemini Vision with the fixed
 * rubric, then recomputes the total deterministically in calculateOutfitScore.
 */
export async function analyzeOutfit(outfitId: string): Promise<OutfitAnalysisDto> {
  const outfit = await prisma.outfit.findUnique({
    where: { id: outfitId },
    include: {
      items: { include: { clothingItem: true }, orderBy: { position: "asc" } },
    },
  });
  if (!outfit) throw new AppError("NOT_FOUND", "Outfit not found.");
  if (!outfit.generatedImageKey) {
    throw new AppError("INVALID_INPUT", "Generate the outfit preview before analyzing it.");
  }

  const storage = getStorage();
  const env = getEnv();
  const language = LANGUAGE_NAMES[env.ANALYSIS_LOCALE] ?? "English";
  const models = getModels();

  const preview = await storage.get(outfit.generatedImageKey);
  const previewAi = await toAiInputImage(preview.body, 1024);

  const blocks: AiBlock[] = [
    textBlock("AI-generated outfit preview (all items worn together on a mannequin):"),
    imageBlockFromBuffer(previewAi.buffer, "image/jpeg"),
  ];
  for (const entry of outfit.items) {
    const item = entry.clothingItem;
    const { body } = await storage.get(item.imageKey);
    const itemAi = await toAiInputImage(body, 512);
    const slotLabel = SLOT_LABELS[entry.slot as OutfitSlot] ?? entry.slot;
    blocks.push(
      textBlock(
        `Original product — ${slotLabel}: ${item.category}${
          item.description ? `. ${item.description}` : ""
        }`,
      ),
      imageBlockFromBuffer(itemAi.buffer, "image/jpeg"),
    );
  }
  blocks.push(textBlock("Score this outfit against the rubric and return the JSON."));

  const parsed = await generateStructured<OutfitAnalysisResponse>({
    model: models.vision,
    input: blocks,
    system: buildSystemPrompt(language),
    schema: OUTFIT_ANALYSIS_JSON_SCHEMA,
    zodSchema: outfitAnalysisResponseSchema,
    seed: ANALYSIS_SEED,
    maxOutputTokens: 4096,
  });

  const computed = calculateOutfitScore(parsed.breakdown as RawBreakdown);
  const improvements: ImprovementDto[] = parsed.improvements.map((i) => ({
    action: i.action,
    text: i.text,
  }));

  const dto: OutfitAnalysisDto = {
    overallScore: computed.overallScore,
    label: computed.label,
    breakdown: computed.breakdown,
    styleComment: parsed.styleComment,
    whyItWorks: parsed.whyItWorks,
    improvements,
    bestFor: parsed.bestFor,
    detectedStyles: parsed.detectedStyles,
    dominantColors: parsed.dominantColors,
  };

  await prisma.$transaction([
    prisma.outfitAnalysis.upsert({
      where: { outfitId },
      update: {
        overallScore: dto.overallScore,
        label: dto.label,
        breakdown: dto.breakdown as unknown as Prisma.InputJsonValue,
        styleComment: dto.styleComment,
        whyItWorks: dto.whyItWorks,
        improvements: dto.improvements as unknown as Prisma.InputJsonValue,
        bestFor: dto.bestFor,
        detectedStyles: dto.detectedStyles,
        dominantColors: dto.dominantColors,
        model: models.vision,
        promptVersion: PROMPT_VERSION,
      },
      create: {
        outfitId,
        overallScore: dto.overallScore,
        label: dto.label,
        breakdown: dto.breakdown as unknown as Prisma.InputJsonValue,
        styleComment: dto.styleComment,
        whyItWorks: dto.whyItWorks,
        improvements: dto.improvements as unknown as Prisma.InputJsonValue,
        bestFor: dto.bestFor,
        detectedStyles: dto.detectedStyles,
        dominantColors: dto.dominantColors,
        model: models.vision,
        promptVersion: PROMPT_VERSION,
      },
    }),
    prisma.outfit.update({
      where: { id: outfitId },
      data: { status: "ANALYZED", overallScore: dto.overallScore, failureCode: null },
    }),
  ]);

  return dto;
}

/** Named seam from spec §28 — recommendations are part of the analysis DTO. */
export function generateStyleRecommendations(analysis: OutfitAnalysisDto): ImprovementDto[] {
  return analysis.improvements;
}
