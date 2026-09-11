/**
 * Canonical clothing taxonomy shared by the AI services, the API layer
 * and the UI. Extend CLOTHING_CATEGORIES (and CATEGORY_TO_SLOT) to add types.
 */

export const CLOTHING_CATEGORIES = [
  "shirt",
  "tshirt",
  "polo",
  "sweatshirt",
  "hoodie",
  "jacket",
  "coat",
  "blazer",
  "pants",
  "jeans",
  "shorts",
  "skirt",
  "dress",
  "sneakers",
  "boots",
  "loafers",
  "heels",
  "sandals",
  "bag",
  "belt",
  "hat",
  "watch",
  "glasses",
  "accessory",
] as const;

export type ClothingCategory = (typeof CLOTHING_CATEGORIES)[number];

export type OutfitSlot = "top" | "bottom" | "full" | "outerwear" | "shoes" | "accessory";

export const CATEGORY_TO_SLOT: Record<ClothingCategory, OutfitSlot> = {
  shirt: "top",
  tshirt: "top",
  polo: "top",
  sweatshirt: "top",
  hoodie: "top",
  jacket: "outerwear",
  coat: "outerwear",
  blazer: "outerwear",
  pants: "bottom",
  jeans: "bottom",
  shorts: "bottom",
  skirt: "bottom",
  dress: "full",
  sneakers: "shoes",
  boots: "shoes",
  loafers: "shoes",
  heels: "shoes",
  sandals: "shoes",
  bag: "accessory",
  belt: "accessory",
  hat: "accessory",
  watch: "accessory",
  glasses: "accessory",
  accessory: "accessory",
};

/** Dressing / rendering order used by the prompt builder and the UI. */
export const SLOT_ORDER: OutfitSlot[] = ["top", "full", "bottom", "outerwear", "shoes", "accessory"];

export const SLOT_LABELS: Record<OutfitSlot, string> = {
  top: "Top",
  bottom: "Bottom",
  full: "Dress",
  outerwear: "Jacket",
  shoes: "Shoes",
  accessory: "Accessory",
};

/** Common free-text answers mapped back onto the canonical taxonomy. */
const CATEGORY_SYNONYMS: Record<string, ClothingCategory> = {
  "t-shirt": "tshirt",
  tee: "tshirt",
  "tank top": "tshirt",
  "polo shirt": "polo",
  jumper: "sweatshirt",
  pullover: "sweatshirt",
  sweater: "sweatshirt",
  knitwear: "sweatshirt",
  cardigan: "sweatshirt",
  hoody: "hoodie",
  parka: "coat",
  trench: "coat",
  "trench coat": "coat",
  overcoat: "coat",
  puffer: "jacket",
  "denim jacket": "jacket",
  bomber: "jacket",
  "suit jacket": "blazer",
  trousers: "pants",
  chinos: "pants",
  slacks: "pants",
  denim: "jeans",
  jean: "jeans",
  short: "shorts",
  sneaker: "sneakers",
  trainers: "sneakers",
  trainer: "sneakers",
  shoe: "sneakers",
  shoes: "sneakers",
  boot: "boots",
  loafer: "loafers",
  heel: "heels",
  "high heels": "heels",
  sandal: "sandals",
  slides: "sandals",
  handbag: "bag",
  backpack: "bag",
  tote: "bag",
  purse: "bag",
  cap: "hat",
  beanie: "hat",
  sunglasses: "glasses",
  eyeglasses: "glasses",
  scarf: "accessory",
  necklace: "accessory",
  bracelet: "accessory",
  jewelry: "accessory",
  tie: "accessory",
};

/**
 * Maps a free-text category to the canonical taxonomy.
 * `matched: false` means the fallback ("accessory") was used, so callers
 * should lower confidence and let the user correct it in the UI.
 */
export function normalizeCategory(raw: string | null | undefined): {
  category: ClothingCategory;
  matched: boolean;
} {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) return { category: "accessory", matched: false };
  if ((CLOTHING_CATEGORIES as readonly string[]).includes(value)) {
    return { category: value as ClothingCategory, matched: true };
  }
  if (CATEGORY_SYNONYMS[value]) return { category: CATEGORY_SYNONYMS[value], matched: true };
  const singular = value.endsWith("s") ? value.slice(0, -1) : `${value}s`;
  if ((CLOTHING_CATEGORIES as readonly string[]).includes(singular)) {
    return { category: singular as ClothingCategory, matched: true };
  }
  if (CATEGORY_SYNONYMS[singular]) return { category: CATEGORY_SYNONYMS[singular], matched: true };
  return { category: "accessory", matched: false };
}

export function slotForCategory(category: ClothingCategory): OutfitSlot {
  return CATEGORY_TO_SLOT[category];
}

/** Attributes the vision model extracts for a single garment (spec §7). */
export interface ClothingAttributes {
  category: ClothingCategory;
  subcategory?: string | null;
  color: string;
  secondaryColors: string[];
  pattern: string;
  material?: string | null;
  fit?: string | null;
  style?: string | null;
  season?: string | null;
  formality?: string | null;
  genderPresentation?: string | null;
  description: string;
  confidence: number;
}
