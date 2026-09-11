import { NextRequest } from "next/server";
import { getUserIdIfExists } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ok, toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { toOutfitDto } from "@/services/outfit-serializer";

export const runtime = "nodejs";

/** GET /api/outfits/:id — full outfit state incl. items and analysis (spec §25). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const userId = await getUserIdIfExists();
    const outfit = await prisma.outfit.findUnique({
      where: { id },
      include: {
        items: {
          include: { clothingItem: { include: { productSource: true } } },
          orderBy: { position: "asc" },
        },
        analysis: true,
      },
    });
    // Ownership check without leaking existence.
    if (!outfit || (outfit.userId && outfit.userId !== userId)) {
      throw new AppError("NOT_FOUND", "Outfit not found.");
    }
    return ok(toOutfitDto(outfit));
  } catch (e) {
    return toErrorResponse(e);
  }
}
