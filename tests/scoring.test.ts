import { describe, expect, it } from "vitest";
import {
  calculateOutfitScore,
  scoreLabel,
  SCORE_CRITERIA,
  type RawBreakdown,
} from "@/services/outfit-analysis/scoring";

function fullBreakdown(score: (max: number) => number): RawBreakdown {
  return Object.fromEntries(
    SCORE_CRITERIA.map((c) => [c.key, { score: score(c.max), reasoning: "ok" }]),
  ) as RawBreakdown;
}

describe("scoreLabel thresholds", () => {
  it("maps boundaries exactly", () => {
    expect(scoreLabel(90)).toBe("Outstanding");
    expect(scoreLabel(89)).toBe("Excellent");
    expect(scoreLabel(80)).toBe("Excellent");
    expect(scoreLabel(79)).toBe("Good");
    expect(scoreLabel(70)).toBe("Good");
    expect(scoreLabel(69)).toBe("Fair");
    expect(scoreLabel(55)).toBe("Fair");
    expect(scoreLabel(54)).toBe("Needs work");
  });
});

describe("calculateOutfitScore", () => {
  it("sums a perfect breakdown to 100", () => {
    const result = calculateOutfitScore(fullBreakdown((max) => max));
    expect(result.overallScore).toBe(100);
    expect(result.label).toBe("Outstanding");
    expect(result.breakdown).toHaveLength(SCORE_CRITERIA.length);
  });

  it("clamps scores above the maximum and below zero", () => {
    const raw = fullBreakdown((max) => max);
    raw.colorHarmony = { score: 999, reasoning: "over" };
    raw.versatility = { score: -5, reasoning: "under" };
    const result = calculateOutfitScore(raw);
    const color = result.breakdown.find((b) => b.key === "colorHarmony")!;
    const vers = result.breakdown.find((b) => b.key === "versatility")!;
    expect(color.score).toBe(20);
    expect(vers.score).toBe(0);
    expect(result.overallScore).toBe(95); // 100 - versatility(5)
  });

  it("treats missing or non-finite entries as zero", () => {
    const raw = fullBreakdown((max) => max) as Partial<RawBreakdown>;
    delete raw.fashionImpact;
    (raw as RawBreakdown).visualBalance = { score: Number.NaN, reasoning: "" };
    const result = calculateOutfitScore(raw as RawBreakdown);
    expect(result.breakdown.find((b) => b.key === "fashionImpact")!.score).toBe(0);
    expect(result.breakdown.find((b) => b.key === "visualBalance")!.score).toBe(0);
    expect(result.overallScore).toBe(85); // 100 - 5 - 10
  });

  it("recomputes the overall server-side with one-decimal criteria", () => {
    const raw = fullBreakdown(() => 0);
    raw.colorHarmony = { score: 10.44, reasoning: "" };
    raw.styleConsistency = { score: 10.46, reasoning: "" };
    const result = calculateOutfitScore(raw);
    expect(result.breakdown.find((b) => b.key === "colorHarmony")!.score).toBe(10.4);
    expect(result.breakdown.find((b) => b.key === "styleConsistency")!.score).toBe(10.5);
    expect(result.overallScore).toBe(21); // round(20.9)
  });
});
