import { describe, expect, it } from "vitest";
import { clothingAnalysisResponseSchema } from "@/services/clothing-analysis/schema";
import { toAttributes } from "@/services/clothing-analysis";
import { normalizeCategory } from "@/types/clothing";

describe("normalizeCategory", () => {
  it("maps synonyms into the 24-category taxonomy", () => {
    expect(normalizeCategory("trainers")).toEqual({ category: "sneakers", matched: true });
    expect(normalizeCategory("T-Shirt")).toEqual({ category: "tshirt", matched: true });
    expect(normalizeCategory("Jumper")).toEqual({ category: "sweatshirt", matched: true });
  });

  it("falls back to accessory for unknown labels", () => {
    const result = normalizeCategory("space suit");
    expect(result.category).toBe("accessory");
    expect(result.matched).toBe(false);
  });
});

describe("clothingAnalysisResponseSchema + toAttributes", () => {
  it("parses multiple garments from one photo", () => {
    const parsed = clothingAnalysisResponseSchema.parse({
      items: [
        {
          category: "tshirt",
          color: "white",
          pattern: "solid",
          description: "plain white tee",
          confidence: 0.94,
        },
        {
          category: "jeans",
          color: "blue",
          pattern: "solid",
          description: "straight-leg jeans",
          confidence: 0.9,
        },
      ],
    });
    expect(parsed.items).toHaveLength(2);
    const first = toAttributes(parsed.items[0]!);
    expect(first.category).toBe("tshirt");
    expect(first.categoryMatched).toBe(true);
  });

  it("coerces out-of-taxonomy categories and caps their confidence", () => {
    const parsed = clothingAnalysisResponseSchema.parse({
      items: [
        {
          category: "medieval armor",
          color: "silver",
          pattern: "solid",
          description: "shiny plate armor",
          confidence: 0.95,
        },
      ],
    });
    const attrs = toAttributes(parsed.items[0]!);
    expect(attrs.category).toBe("accessory");
    expect(attrs.categoryMatched).toBe(false);
    expect(attrs.confidence).toBeLessThanOrEqual(0.4);
  });

  it("tolerates missing optional fields via catch defaults", () => {
    const parsed = clothingAnalysisResponseSchema.parse({
      items: [
        {
          category: "sneakers",
          color: "white",
          pattern: "solid",
          description: "leather sneakers",
          confidence: 0.8,
          season: "definitely-not-a-season",
          formality: 42,
        },
      ],
    });
    const attrs = toAttributes(parsed.items[0]!);
    expect(attrs.category).toBe("sneakers");
    // invalid enum-ish values fall back instead of failing the whole response
    expect(attrs.confidence).toBe(0.8);
  });
});
