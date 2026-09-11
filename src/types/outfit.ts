export const MANNEQUIN_TYPES = ["NEUTRAL", "MALE", "FEMALE"] as const;
export type MannequinType = (typeof MANNEQUIN_TYPES)[number];

export const MANNEQUIN_LABELS: Record<MannequinType, string> = {
  NEUTRAL: "Neutral mannequin",
  MALE: "Male mannequin",
  FEMALE: "Female mannequin",
};

/**
 * Optional style direction for the generated preview. "auto" lets the model
 * compose the garments as they are; the others steer only styling context
 * (pose framing, background mood) — never the garments themselves.
 * This is the seam for the future "alternative outfits" feature (spec §17).
 */
export const STYLE_PRESETS = ["auto", "minimal", "smart-casual", "streetwear"] as const;
export type StylePreset = (typeof STYLE_PRESETS)[number];

export const STYLE_PRESET_LABELS: Record<StylePreset, string> = {
  auto: "Auto",
  minimal: "Minimal",
  "smart-casual": "Smart casual",
  streetwear: "Streetwear",
};

export type OutfitStatusValue =
  | "DRAFT"
  | "GENERATING"
  | "GENERATED"
  | "ANALYZING"
  | "ANALYZED"
  | "FAILED";
