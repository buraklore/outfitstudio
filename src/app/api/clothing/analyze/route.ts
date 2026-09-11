import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/auth";
import { enforceRateLimit, ok, readJson, toErrorResponse } from "@/lib/http";
import { analyzeRequestSchema } from "@/lib/validation";
import { mapWithConcurrency } from "@/lib/utils";
import { analyzeClothingImage } from "@/services/clothing-analysis";
import { getStorage } from "@/services/storage";
import type { AnalyzeResponseDto } from "@/types/api";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/clothing/analyze — Gemini Vision analysis of stored images
 * (spec §7). Multiple garments per photo are supported; results are cached
 * by image hash. An image with zero detected items returns an empty array —
 * the client shows the §22 "upload a clearer image" message.
 */
export async function POST(req: NextRequest) {
  try {
    enforceRateLimit(req, { key: "analyze", limit: 20 });
    await getOrCreateUserId();
    const body = analyzeRequestSchema.parse(await readJson(req));
    const storage = getStorage();

    const results = await mapWithConcurrency(body.images, 2, async (image) => {
      const { body: buffer } = await storage.get(image.imageKey);
      const items = await analyzeClothingImage({
        buffer,
        imageKey: image.imageKey,
        imageUrl: storage.publicUrl(image.imageKey),
        slotHint: image.slotHint,
        locale: body.locale,
      });
      return { imageKey: image.imageKey, imageUrl: storage.publicUrl(image.imageKey), items };
    });

    const dto: AnalyzeResponseDto = { results };
    return ok(dto);
  } catch (e) {
    return toErrorResponse(e);
  }
}
