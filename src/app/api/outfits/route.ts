import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { getOrCreateUserId } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { enforceRateLimit, ok, readJson, toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { createOutfitSchema } from "@/lib/validation";
import { buildOutfit } from "@/services/outfit-generation";
import { getStorage } from "@/services/storage";
import type { CreateOutfitResponseDto } from "@/types/api";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/outfits — persists the reviewed items as ClothingItems and an
 * Outfit with slot-ordered OutfitItems (spec §24/§30). Returns informational
 * warnings (e.g. "No shoes selected") without blocking.
 */
export async function POST(req: NextRequest) {
  try {
    enforceRateLimit(req, { key: "outfits", limit: 20 });
    const userId = await getOrCreateUserId();
    const input = createOutfitSchema.parse(await readJson(req));

    const { slots, warnings } = buildOutfit(input.items);
    const storage = getStorage();

    let outfitId: string;
    try {
      outfitId = await prisma.$transaction(async (tx) => {
        const outfit = await tx.outfit.create({
          data: {
            userId,
            status: "DRAFT",
            mannequinType: input.mannequinType,
            stylePreset: input.stylePreset,
            locale: input.locale,
          },
        });
        for (const slot of slots) {
          const item = input.items[slot.itemIndex]!;
          const clothing = await tx.clothingItem.create({
            data: {
              userId,
              source: item.source,
              sourceUrl: item.sourceUrl ?? null,
              productSourceId: item.productSourceId ?? null,
              imageKey: item.imageKey,
              imageUrl: storage.publicUrl(item.imageKey),
              category: item.category,
              subcategory: item.subcategory ?? null,
              color: item.color ?? null,
              secondaryColors: item.secondaryColors ?? [],
              pattern: item.pattern ?? null,
              material: item.material ?? null,
              fit: item.fit ?? null,
              style: item.style ?? null,
              season: item.season ?? null,
              formality: item.formality ?? null,
              genderPresentation: item.genderPresentation ?? null,
              description: item.description ?? null,
              confidence: item.confidence ?? null,
              metadata: (item.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
            },
          });
          await tx.outfitItem.create({
            data: {
              outfitId: outfit.id,
              clothingItemId: clothing.id,
              slot: slot.slot,
              position: slot.position,
            },
          });
        }
        return outfit.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
        throw new AppError("INVALID_INPUT", "Invalid product source reference.", { cause: e });
      }
      throw e;
    }

    const dto: CreateOutfitResponseDto = { id: outfitId, warnings };
    return ok(dto);
  } catch (e) {
    return toErrorResponse(e);
  }
}
