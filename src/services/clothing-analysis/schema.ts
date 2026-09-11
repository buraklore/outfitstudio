import { z } from "zod";
import { CLOTHING_CATEGORIES } from "@/types/clothing";

/**
 * Twin schemas for the vision call (spec §7/§23):
 *  - CLOTHING_ANALYSIS_JSON_SCHEMA constrains the model output on the API side
 *  - clothingAnalysisResponseSchema validates what actually came back
 */

export const rawClothingItemSchema = z.object({
  category: z.string(),
  subcategory: z.string().nullish().catch(null),
  color: z.string().catch("unknown").default("unknown"),
  secondaryColors: z.array(z.string()).max(6).catch([]).default([]),
  pattern: z.string().catch("plain").default("plain"),
  material: z.string().nullish().catch(null),
  fit: z.string().nullish().catch(null),
  style: z.string().nullish().catch(null),
  season: z.string().nullish().catch(null),
  formality: z.string().nullish().catch(null),
  genderPresentation: z.string().nullish().catch(null),
  description: z.string().catch("").default(""),
  confidence: z.number().min(0).max(1).catch(0.5),
});

export type RawClothingItem = z.infer<typeof rawClothingItemSchema>;

export const clothingAnalysisResponseSchema = z.object({
  items: z.array(rawClothingItemSchema).max(6).default([]),
});

export const CLOTHING_ANALYSIS_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    items: {
      type: "array",
      maxItems: 6,
      description: "Every distinct garment or accessory visible in the photo.",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [...CLOTHING_CATEGORIES],
            description: "The canonical category of this item.",
          },
          subcategory: {
            type: "string",
            description: "More specific type, e.g. 'oversized shirt', 'chunky sneakers'.",
          },
          color: { type: "string", description: "Primary color in simple words, e.g. 'white'." },
          secondaryColors: { type: "array", items: { type: "string" }, maxItems: 4 },
          pattern: {
            type: "string",
            description: "'plain' if none; otherwise e.g. 'striped', 'floral', 'graphic print'.",
          },
          material: {
            type: "string",
            description:
              "Hedged wording only, e.g. 'appears to be cotton'. Fabric cannot be verified from a photo.",
          },
          fit: { type: "string", description: "e.g. 'oversized', 'slim', 'relaxed', 'tailored'." },
          style: {
            type: "string",
            description: "e.g. 'casual', 'streetwear', 'minimal', 'formal', 'old money'.",
          },
          season: {
            type: "string",
            enum: ["spring", "summer", "autumn", "winter", "all-season"],
          },
          formality: {
            type: "string",
            enum: ["casual", "smart casual", "business", "formal", "sporty"],
          },
          genderPresentation: { type: "string", enum: ["men", "women", "unisex"] },
          description: {
            type: "string",
            description:
              "One factual sentence with the visual details needed to reproduce this exact item.",
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["category", "color", "pattern", "description", "confidence"],
      },
    },
  },
  required: ["items"],
};
