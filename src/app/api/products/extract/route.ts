import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/auth";
import { enforceRateLimit, ok, readJson, toErrorResponse } from "@/lib/http";
import { extractRequestSchema } from "@/lib/validation";
import { extractProductFromUrl } from "@/services/product-extraction";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/products/extract — URL → product image + metadata (spec §5/§6).
 * SSRF-guarded fetch; failures map to the client-side "please upload the
 * image instead" fallback.
 */
export async function POST(req: NextRequest) {
  try {
    enforceRateLimit(req, { key: "extract", limit: 20 });
    const userId = await getOrCreateUserId();
    const body = extractRequestSchema.parse(await readJson(req));
    const result = await extractProductFromUrl(body.url, userId);
    return ok(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
