import { SLOT_LABELS, type OutfitSlot } from "@/types/clothing";
import type { MannequinType, StylePreset } from "@/types/outfit";

/**
 * Prompt architecture for the mannequin preview (spec §9/§10/§11/§35).
 * The prompt is built from data — never hard-coded in the UI — and every
 * garment is referenced by its input-image index with a factual description,
 * followed by explicit preservation rules. Bump OUTFIT_PROMPT_VERSION when
 * the wording changes so caches and stored prompts stay traceable.
 */

export const OUTFIT_PROMPT_VERSION = "v2";

export interface PromptItem {
  /** 1-based position of this garment among the input images. */
  index: number;
  slot: OutfitSlot;
  category: string;
  description: string;
  color?: string | null;
  pattern?: string | null;
  fit?: string | null;
  material?: string | null;
}

export interface OutfitPromptOptions {
  items: PromptItem[];
  mannequinType: MannequinType;
  stylePreset?: StylePreset;
  pose?: string;
  background?: string;
  lighting?: string;
  cameraAngle?: string;
  realism?: string;
}

const MANNEQUIN_DESCRIPTIONS: Record<MannequinType, string> = {
  NEUTRAL:
    "a gender-neutral, androgynous, featureless retail display mannequin (slim, neutral silhouette)",
  MALE:
    "a clearly MALE retail display mannequin form — broad shoulders, flat chest, straight hips, masculine proportions — completely featureless",
  FEMALE:
    "a clearly FEMALE retail display mannequin form — narrower shoulders, defined waist, feminine proportions — completely featureless",
};

/** Styling context only — never permission to alter the garments. */
const PRESET_NOTES: Record<StylePreset, string> = {
  auto: "",
  minimal:
    "Styling context: compose with a calm, minimal editorial mood (framing and light only — the garments stay exactly as provided).",
  "smart-casual":
    "Styling context: a polished smart-casual catalog mood (framing and light only — the garments stay exactly as provided).",
  streetwear:
    "Styling context: a contemporary streetwear lookbook mood (framing and light only — the garments stay exactly as provided).",
};

export function buildOutfitGenerationPrompt(opts: OutfitPromptOptions): string {
  const mannequin = MANNEQUIN_DESCRIPTIONS[opts.mannequinType];
  const pose = opts.pose ?? "a neutral, symmetric standing pose with arms relaxed at the sides";
  const background = opts.background ?? "a seamless, soft off-white studio background";
  const lighting = opts.lighting ?? "soft, diffused studio lighting with a gentle floor shadow";
  const cameraAngle = opts.cameraAngle ?? "eye level, straight-on";
  const realism =
    opts.realism ?? "professional e-commerce catalog photo quality, sharp focus on the garments";

  const garmentLines = opts.items
    .map((item) => {
      const details = [
        item.color ? `primary color ${item.color}` : null,
        item.pattern && item.pattern !== "plain" ? `pattern: ${item.pattern}` : null,
        item.fit ? `fit: ${item.fit}` : null,
        item.material ? `material: ${item.material}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      const slotLabel = SLOT_LABELS[item.slot].toUpperCase();
      return `- Input image ${item.index} — ${slotLabel} (${item.category}): ${item.description}${
        details ? ` (${details})` : ""
      }`;
    })
    .join("\n");

  const presetNote = PRESET_NOTES[opts.stylePreset ?? "auto"];

  return `TASK
Create ONE photorealistic fashion catalog photo of ${mannequin} wearing the exact garments provided in the input images, combined as one coherent outfit.

SCENE
- The mannequin is a lifeless store display mannequin: matte light-gray surface, completely featureless head, no face, no hair, no skin texture. It must not look like a real person.
- Full body, front view, ${pose}.
- Background: ${background}. Lighting: ${lighting}.
- Camera: ${cameraAngle}; portrait framing with the entire mannequin visible from head to shoes.
- Quality: ${realism}.

GARMENTS — use the exact items shown in the input images:
${garmentLines}

STRICT PRESERVATION RULES
1. Dress the mannequin ONLY in the garments listed above. Do not add any other clothing or accessories.
2. Preserve every garment's original colors, patterns, prints, embroidery, logos, stitching and hardware exactly as shown in its input image.
3. Preserve every garment's cut, proportions and silhouette (oversized stays oversized, cropped stays cropped, wide-leg stays wide-leg).
4. Preserve the exact shoe design, sole shape and colorway.
5. Do not redesign, recolor, simplify or replace any item with a similar alternative product.
6. Do not invent logos, graphics or details that are not visible in the input images; where a detail is not visible, keep that area plain and neutral.
7. The output must contain no readable brand text unless it is clearly visible on the original garment.
8. NEVER add any garment or accessory that is not among the input images — no belts, watches, jewelry, bags, hats, scarves, sunglasses, undershirts.
9. Dress the mannequin in every garment with natural layering. NEVER place any item on the floor, in the mannequin's hands, or beside the mannequin.
10. If two items occupy the same body area and cannot be layered naturally (e.g. two trousers or two pairs of shoes), the mannequin wears ONLY the first-listed one; omit the other completely from the image.
11. The mannequin's body form must match its stated type exactly; garments drape on that form without changing their own cut.${presetNote ? `\n\n${presetNote}` : ""}`;
}
