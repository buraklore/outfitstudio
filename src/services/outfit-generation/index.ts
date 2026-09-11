import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  generateImage,
  getModels,
  imageBlockFromBuffer,
  textBlock,
  type AiBlock,
} from "@/services/gemini/client";
import { normalizeClothingImage } from "@/services/image-processing";
import { getStorage } from "@/services/storage";
import {
  buildOutfitGenerationPrompt,
  OUTFIT_PROMPT_VERSION,
  type PromptItem,
} from "@/services/outfit-generation/prompt";
import {
  SLOT_ORDER,
  slotForCategory,
  type ClothingCategory,
  type OutfitSlot,
} from "@/types/clothing";
import type { MannequinType, StylePreset } from "@/types/outfit";

/** Nano Banana 2 supports up to 10 high-fidelity object reference images. */
const MAX_REFERENCE_IMAGES = 10;

export interface BuiltOutfitSlot {
  /** Index into the original items array. */
  itemIndex: number;
  slot: OutfitSlot;
  position: number;
}

export interface BuiltOutfit {
  slots: BuiltOutfitSlot[];
  warnings: string[];
}

/**
 * Maps items to outfit slots in dressing order and flags gaps (spec §12/§30).
 * Warnings are informational — the user may intentionally build a partial look.
 */
export function buildOutfit(items: Array<{ category: ClothingCategory }>): BuiltOutfit {
  const slots = items
    .map((item, itemIndex) => ({ itemIndex, slot: slotForCategory(item.category) }))
    .sort((a, b) => {
      const order = SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot);
      return order !== 0 ? order : a.itemIndex - b.itemIndex;
    })
    .map((entry, position) => ({ ...entry, position }));

  const present = new Set(slots.map((s) => s.slot));
  const warnings: string[] = [];
  const hasFull = present.has("full");
  if (!hasFull && !present.has("top")) warnings.push("missing-top");
  if (!hasFull && !present.has("bottom")) warnings.push("missing-bottom");
  if (!present.has("shoes")) warnings.push("missing-shoes");
  if (items.length > MAX_REFERENCE_IMAGES) {
    warnings.push("max-items");
  }
  return { slots, warnings };
}

export interface GeneratedPreview {
  imageKey: string;
  url: string;
}

/**
 * Garments → mannequin pipeline (spec §10): loads the stored item images,
 * feeds them to the image model as high-fidelity references together with the
 * preservation prompt, and stores the rendered preview.
 */
export async function generateMannequinImage(outfitId: string): Promise<GeneratedPreview> {
  const outfit = await prisma.outfit.findUnique({
    where: { id: outfitId },
    include: {
      items: { include: { clothingItem: true }, orderBy: { position: "asc" } },
    },
  });
  if (!outfit) throw new AppError("NOT_FOUND", "Outfit not found.");
  if (outfit.items.length === 0) {
    throw new AppError("INVALID_INPUT", "This outfit has no items.");
  }

  const storage = getStorage();
  const usable = outfit.items.slice(0, MAX_REFERENCE_IMAGES);

  const imageBlocks: AiBlock[] = [];
  const promptItems: PromptItem[] = [];
  for (let i = 0; i < usable.length; i++) {
    const entry = usable[i]!;
    const { body } = await storage.get(entry.clothingItem.imageKey);
    // Stored images are already normalized JPEGs; re-encode defensively in
    // case older/foreign objects exist in the bucket.
    const normalized = await normalizeClothingImage(body, { maxSide: 1024, quality: 88 });
    imageBlocks.push(imageBlockFromBuffer(normalized.buffer, "image/jpeg"));
    promptItems.push({
      index: i + 1,
      slot: entry.slot as OutfitSlot,
      category: entry.clothingItem.category,
      description:
        entry.clothingItem.description ??
        `${entry.clothingItem.color ?? ""} ${entry.clothingItem.category}`.trim(),
      color: entry.clothingItem.color,
      pattern: entry.clothingItem.pattern,
      fit: entry.clothingItem.fit,
      material: entry.clothingItem.material,
    });
  }

  const prompt = buildOutfitGenerationPrompt({
    items: promptItems,
    mannequinType: outfit.mannequinType as MannequinType,
    stylePreset: (outfit.stylePreset ?? "auto") as StylePreset,
  });

  const models = getModels();
  const result = await generateImage({
    model: models.image,
    input: [...imageBlocks, textBlock(prompt)],
    aspectRatio: "3:4",
    imageSize: "1K",
  });

  const ext = result.mimeType === "image/jpeg" ? "jpg" : "png";
  const imageKey = `outfits/${outfitId}/preview-${Date.now()}.${ext}`;
  const stored = await storage.put(imageKey, result.data, result.mimeType);

  await prisma.$transaction([
    prisma.generatedImage.create({
      data: {
        outfitId,
        imageKey,
        url: stored.url,
        prompt: `${OUTFIT_PROMPT_VERSION}\n${prompt}`,
        model: models.image,
      },
    }),
    prisma.outfit.update({
      where: { id: outfitId },
      data: {
        status: "GENERATED",
        generatedImageKey: imageKey,
        generatedImageUrl: stored.url,
        failureCode: null,
      },
    }),
  ]);

  return { imageKey, url: stored.url };
}
