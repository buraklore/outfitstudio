import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/auth";
import { AppError, normalizeError } from "@/lib/errors";
import { enforceRateLimit, ok, toErrorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { analyzeOutfit } from "@/services/outfit-analysis";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * POST /api/outfits/:id/analyze — scores the generated outfit (spec §12/§13).
 * On failure the status reverts to GENERATED so the preview stays usable and
 * the analysis can be retried.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    enforceRateLimit(req, { key: "outfit-analyze", limit: 10 });
    const { id } = await params;
    const userId = await getOrCreateUserId();

    const outfit = await prisma.outfit.findUnique({ where: { id } });
    if (!outfit || (outfit.userId && outfit.userId !== userId)) {
      throw new AppError("NOT_FOUND", "Outfit not found.");
    }
    if (!outfit.generatedImageKey) {
      throw new AppError("INVALID_INPUT", "Generate the outfit preview first.");
    }

    await prisma.outfit.update({ where: { id }, data: { status: "ANALYZING" } });

    try {
      const analysis = await analyzeOutfit(id);
      return ok(analysis);
    } catch (e) {
      const err = normalizeError(e);
      await prisma.outfit
        .update({ where: { id }, data: { status: "GENERATED", failureCode: err.code } })
        .catch(() => undefined);
      throw err;
    }
  } catch (e) {
    return toErrorResponse(e);
  }
}
