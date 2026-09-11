/**
 * Deterministic scoring core (spec §13/§36). The AI proposes per-criterion
 * scores; this module clamps them to the fixed weights, recomputes the total
 * server-side and derives the label — the model never controls the arithmetic.
 * Pure and unit-tested (tests/scoring.test.ts).
 */

export const SCORE_CRITERIA = [
  { key: "colorHarmony", label: "Color harmony", max: 20 },
  { key: "styleConsistency", label: "Style consistency", max: 20 },
  { key: "fitAndProportion", label: "Fit & proportion", max: 15 },
  { key: "itemCompatibility", label: "Item compatibility", max: 15 },
  { key: "occasionSuitability", label: "Occasion suitability", max: 10 },
  { key: "visualBalance", label: "Visual balance", max: 10 },
  { key: "fashionImpact", label: "Trend & fashion impact", max: 5 },
  { key: "versatility", label: "Versatility", max: 5 },
] as const;

export type ScoreKey = (typeof SCORE_CRITERIA)[number]["key"];

export interface RawBreakdownEntry {
  score: number;
  reasoning: string;
}

export type RawBreakdown = Record<ScoreKey, RawBreakdownEntry>;

export interface ScoreEntry {
  key: ScoreKey;
  label: string;
  score: number;
  maxScore: number;
  reasoning: string;
}

export interface ComputedScore {
  overallScore: number;
  label: string;
  breakdown: ScoreEntry[];
}

export function scoreLabel(overall: number): string {
  if (overall >= 90) return "Outstanding";
  if (overall >= 80) return "Excellent";
  if (overall >= 70) return "Good";
  if (overall >= 55) return "Fair";
  return "Needs work";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function calculateOutfitScore(raw: RawBreakdown): ComputedScore {
  const breakdown: ScoreEntry[] = SCORE_CRITERIA.map((criterion) => {
    const entry = raw[criterion.key];
    const clamped = clamp(entry?.score ?? 0, 0, criterion.max);
    return {
      key: criterion.key,
      label: criterion.label,
      score: Math.round(clamped * 10) / 10,
      maxScore: criterion.max,
      reasoning: entry?.reasoning?.trim() ?? "",
    };
  });
  const overallScore = Math.round(breakdown.reduce((sum, e) => sum + e.score, 0));
  return { overallScore, label: scoreLabel(overallScore), breakdown };
}
