import { z } from "zod";
import { SCORE_CRITERIA } from "@/services/outfit-analysis/scoring";

const scoreEntryZ = z.object({
  score: z.number(),
  reasoning: z.string().catch("").default(""),
});

export const outfitAnalysisResponseSchema = z.object({
  breakdown: z.object({
    colorHarmony: scoreEntryZ,
    styleConsistency: scoreEntryZ,
    fitAndProportion: scoreEntryZ,
    itemCompatibility: scoreEntryZ,
    occasionSuitability: scoreEntryZ,
    visualBalance: scoreEntryZ,
    fashionImpact: scoreEntryZ,
    versatility: scoreEntryZ,
  }),
  styleComment: z.string(),
  whyItWorks: z.string().catch("").default(""),
  improvements: z
    .array(
      z.object({
        action: z.enum(["add", "swap", "adjust", "avoid"]).catch("adjust"),
        text: z.string(),
      }),
    )
    .max(8)
    .catch([])
    .default([]),
  bestFor: z.array(z.string()).max(6).catch([]).default([]),
  detectedStyles: z.array(z.string()).max(5).catch([]).default([]),
  dominantColors: z.array(z.string()).max(6).catch([]).default([]),
});

export type OutfitAnalysisResponse = z.infer<typeof outfitAnalysisResponseSchema>;

function breakdownJsonSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const criterion of SCORE_CRITERIA) {
    properties[criterion.key] = {
      type: "object",
      properties: {
        score: {
          type: "number",
          minimum: 0,
          maximum: criterion.max,
          description: `${criterion.label} score, 0 to ${criterion.max}.`,
        },
        reasoning: {
          type: "string",
          description: `One or two objective sentences justifying the ${criterion.label} score.`,
        },
      },
      required: ["score", "reasoning"],
    };
  }
  return {
    type: "object",
    properties,
    required: SCORE_CRITERIA.map((c) => c.key),
  };
}

export const OUTFIT_ANALYSIS_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    breakdown: breakdownJsonSchema(),
    styleComment: {
      type: "string",
      description:
        "A short, high-quality stylist paragraph about the outfit: strongest aspect, overall character, one thing to refine.",
    },
    whyItWorks: {
      type: "string",
      description: "One short paragraph explaining why this combination works (or where it fails).",
    },
    improvements: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      description: "Concrete, actionable suggestions to improve the outfit.",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["add", "swap", "adjust", "avoid"] },
          text: { type: "string" },
        },
        required: ["action", "text"],
      },
    },
    bestFor: {
      type: "array",
      minItems: 2,
      maxItems: 4,
      items: { type: "string" },
      description: "Occasions this outfit suits best, e.g. 'Casual dinner', 'Weekend', 'Office'.",
    },
    detectedStyles: {
      type: "array",
      maxItems: 3,
      items: {
        type: "string",
        enum: [
          "Casual",
          "Smart Casual",
          "Streetwear",
          "Minimal",
          "Old Money",
          "Formal",
          "Business",
          "Sporty",
          "Vintage",
          "Y2K",
          "Workwear",
          "Elegant",
        ],
      },
    },
    dominantColors: { type: "array", maxItems: 5, items: { type: "string" } },
  },
  required: [
    "breakdown",
    "styleComment",
    "whyItWorks",
    "improvements",
    "bestFor",
    "detectedStyles",
    "dominantColors",
  ],
};
