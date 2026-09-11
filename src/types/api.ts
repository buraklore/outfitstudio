import type { ClothingAttributes, ClothingCategory, OutfitSlot } from "@/types/clothing";
import type { MannequinType, OutfitStatusValue, StylePreset } from "@/types/outfit";

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export interface UploadedImageDto {
  imageKey: string;
  url: string;
  width: number;
  height: number;
  sha256: string;
}

export interface ExtractConfidenceDto {
  image: number;
  metadata: number;
}

export interface ExtractedProductDto {
  productSourceId: string;
  imageKey: string;
  imageUrl: string;
  sourceUrl: string;
  domain: string;
  title?: string | null;
  description?: string | null;
  brand?: string | null;
  price?: number | null;
  currency?: string | null;
  color?: string | null;
  size?: string | null;
  category?: string | null;
  extractionMethod: "json-ld" | "opengraph" | "heuristic";
  confidence: ExtractConfidenceDto;
}

export interface AnalyzedItemDto extends ClothingAttributes {
  imageKey: string;
  imageUrl: string;
  /** false when the model's category fell outside the taxonomy and was coerced. */
  categoryMatched: boolean;
}

export interface AnalyzeImageResultDto {
  imageKey: string;
  imageUrl: string;
  items: AnalyzedItemDto[];
}

export interface AnalyzeResponseDto {
  results: AnalyzeImageResultDto[];
}

export interface OutfitItemInputDto extends Partial<Omit<ClothingAttributes, "category">> {
  imageKey: string;
  category: ClothingCategory;
  source: "URL" | "UPLOAD";
  sourceUrl?: string;
  productSourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateOutfitResponseDto {
  id: string;
  warnings: string[];
}

export interface ScoreEntryDto {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  reasoning: string;
}

export interface ImprovementDto {
  action: "add" | "swap" | "adjust" | "avoid";
  text: string;
}

export interface SuggestedOutfitDto {
  summary: string;
  items: string[];
}

export interface OutfitAnalysisDto {
  overallScore: number;
  label: string;
  breakdown: ScoreEntryDto[];
  styleComment: string;
  whyItWorks: string;
  improvements: ImprovementDto[];
  bestFor: string[];
  detectedStyles: string[];
  dominantColors: string[];
  suggestedOutfit: SuggestedOutfitDto | null;
}

export interface OutfitItemDto {
  id: string;
  slot: OutfitSlot;
  position: number;
  category: ClothingCategory;
  imageUrl: string;
  description?: string | null;
  color?: string | null;
  source: "URL" | "UPLOAD";
  sourceUrl?: string | null;
  brand?: string | null;
  price?: number | null;
  currency?: string | null;
}

export interface OutfitDto {
  id: string;
  status: OutfitStatusValue;
  locale: "tr" | "en";
  mannequinType: MannequinType;
  stylePreset: StylePreset | null;
  generatedImageUrl: string | null;
  overallScore: number | null;
  createdAt: string;
  items: OutfitItemDto[];
  analysis: OutfitAnalysisDto | null;
}

export interface GenerateResponseDto {
  outfitId: string;
  generatedImageUrl: string;
}
