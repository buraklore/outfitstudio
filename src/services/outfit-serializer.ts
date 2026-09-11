import type { Prisma } from "@prisma/client";
import type {
  ImprovementDto,
  OutfitAnalysisDto,
  OutfitDto,
  OutfitItemDto,
  ScoreEntryDto,
} from "@/types/api";
import type { ClothingCategory, OutfitSlot } from "@/types/clothing";
import type { MannequinType, OutfitStatusValue, StylePreset } from "@/types/outfit";

export type OutfitWithRelations = Prisma.OutfitGetPayload<{
  include: {
    items: { include: { clothingItem: { include: { productSource: true } } } };
    analysis: true;
  };
}>;

type StoredAnalysis = NonNullable<OutfitWithRelations["analysis"]>;

export function toOutfitDto(outfit: OutfitWithRelations): OutfitDto {
  const items: OutfitItemDto[] = [...outfit.items]
    .sort((a, b) => a.position - b.position)
    .map((entry) => ({
      id: entry.id,
      slot: entry.slot as OutfitSlot,
      position: entry.position,
      category: entry.clothingItem.category as ClothingCategory,
      imageUrl: entry.clothingItem.imageUrl,
      description: entry.clothingItem.description,
      color: entry.clothingItem.color,
      source: entry.clothingItem.source,
      sourceUrl: entry.clothingItem.sourceUrl,
      brand: entry.clothingItem.productSource?.brand ?? null,
      price: entry.clothingItem.productSource?.price ?? null,
      currency: entry.clothingItem.productSource?.currency ?? null,
    }));

  return {
    id: outfit.id,
    status: outfit.status as OutfitStatusValue,
    mannequinType: outfit.mannequinType as MannequinType,
    stylePreset: (outfit.stylePreset as StylePreset | null) ?? null,
    generatedImageUrl: outfit.generatedImageUrl,
    overallScore: outfit.overallScore,
    createdAt: outfit.createdAt.toISOString(),
    items,
    analysis: outfit.analysis ? toAnalysisDto(outfit.analysis) : null,
  };
}

export function toAnalysisDto(analysis: StoredAnalysis): OutfitAnalysisDto {
  const breakdownRaw = analysis.breakdown as unknown;
  const improvementsRaw = analysis.improvements as unknown;
  const breakdown: ScoreEntryDto[] = Array.isArray(breakdownRaw)
    ? (breakdownRaw as ScoreEntryDto[])
    : [];
  const improvements: ImprovementDto[] = Array.isArray(improvementsRaw)
    ? (improvementsRaw as ImprovementDto[])
    : [];
  return {
    overallScore: analysis.overallScore,
    label: analysis.label,
    breakdown,
    styleComment: analysis.styleComment,
    whyItWorks: analysis.whyItWorks,
    improvements,
    bestFor: analysis.bestFor,
    detectedStyles: analysis.detectedStyles,
    dominantColors: analysis.dominantColors,
  };
}
