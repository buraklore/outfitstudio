import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/auth";
import { AppError, normalizeError } from "@/lib/errors";
import { enforceRateLimit, ok, toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { generateMannequinImage } from "@/services/outfit-generation";
import type { GenerateResponseDto } from "@/types/api";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/outfits/:id/generate — renders the mannequin preview (spec §10).
 * Status transitions are honest: GENERATING → GENERATED, or FAILED with a
 * failureCode the client maps to the §22 retry message.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceRateLimit(req, { key: "generate", limit: 6 });
    const { id } = await params;
    const userId = await getOrCreateUserId();

    const outfit = await prisma.outfit.findUnique({ where: { id } });
    if (!outfit || (outfit.userId && outfit.userId !== userId)) {
      throw new AppError("NOT_FOUND", "Outfit not found.");
    }

    await prisma.outfit.update({
      where: { id },
      data: { status: "GENERATING", failureCode: null },
    });

    try {
      const preview = await generateMannequinImage(id);
      const dto: GenerateResponseDto = { outfitId: id, generatedImageUrl: preview.url };
      return ok(dto);
    } catch (e) {
      const err = normalizeError(e);
      await prisma.outfit
        .update({ where: { id }, data: { status: "FAILED", failureCode: err.code } })
        .catch(() => undefined);
      if (err.code === "INTERNAL") {
        throw new AppError("GENERATION_FAILED", undefined, { cause: e });
      }
      throw err;
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
