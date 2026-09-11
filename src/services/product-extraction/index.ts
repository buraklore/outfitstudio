import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { cacheGet, cacheKey, cacheSet } from "@/lib/cache";
import { prisma } from "@/lib/prisma";
import { safeFetch } from "@/lib/security/ssrf";
import {
  imageDimensions,
  normalizeClothingImage,
} from "@/services/image-processing";
import { getStorage, newImageKey } from "@/services/storage";
import {
  parseProductHtml,
  type ExtractionMethod,
  type ParsedProduct,
} from "@/services/product-extraction/html-parser";
import type { ExtractedProductDto } from "@/types/api";

const HTML_MAX_BYTES = 3 * 1024 * 1024;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const PIPELINE_VERSION = "v1";

/**
 * URL → product pipeline (spec §5/§6):
 *   validate + SSRF-check → fetch page → parse (JSON-LD / OG / heuristic) →
 *   download the best image candidate → normalize → store → persist source.
 *
 * The pipeline never tries to defeat robots.txt, CAPTCHAs, logins or anti-bot
 * systems — a plain, honest fetch either works or fails, and failures map to
 * the "please upload the image instead" fallback on the client (spec §6).
 */
export async function extractProductFromUrl(
  rawUrl: string,
  userId?: string,
): Promise<ExtractedProductDto> {
  void userId; // reserved for per-user quotas later
  const trimmed = rawUrl.trim();
  const key = cacheKey("product-extract", PIPELINE_VERSION, trimmed);
  const cached = await cacheGet<ExtractedProductDto>(key);
  if (cached) return cached;

  const page = await safeFetch(trimmed, {
    maxBytes: HTML_MAX_BYTES,
    timeoutMs: 12_000,
    accept: "text/html,application/xhtml+xml;q=0.9,image/*;q=0.8,*/*;q=0.5",
  });

  let parsed: ParsedProduct;
  let imageBuffer: Buffer | null = null;
  let chosenImageUrl: string | null = null;

  if (page.contentType.toLowerCase().startsWith("image/")) {
    // The user pasted a direct image URL — accept it as the product image.
    parsed = directImageParse(page.finalUrl);
    imageBuffer = page.body;
    chosenImageUrl = page.finalUrl;
  } else if (/text\/html|application\/xhtml/i.test(page.contentType) || looksLikeHtml(page.body)) {
    parsed = parseProductHtml(page.body.toString("utf8"), page.finalUrl);
    if (parsed.imageCandidates.length === 0) {
      throw new AppError(
        "PRODUCT_IMAGE_NOT_FOUND",
        "No product image could be found on this page.",
      );
    }
    ({ imageBuffer, chosenImageUrl } = await downloadFirstViableImage(parsed.imageCandidates));
    if (!imageBuffer || !chosenImageUrl) {
      throw new AppError(
        "PRODUCT_IMAGE_NOT_FOUND",
        "The product images on this page could not be downloaded.",
      );
    }
  } else {
    throw new AppError("URL_FETCH_FAILED", "This URL is not an HTML page or an image.");
  }

  let normalized;
  try {
    normalized = await normalizeClothingImage(imageBuffer);
  } catch (e) {
    throw new AppError(
      "PRODUCT_IMAGE_NOT_FOUND",
      "The product image could not be processed.",
      { cause: e },
    );
  }

  const storage = getStorage();
  const imageKey = newImageKey("products");
  const stored = await storage.put(imageKey, normalized.buffer, "image/jpeg");

  const domain = new URL(page.finalUrl).hostname;
  const source = await prisma.productSource.create({
    data: {
      url: trimmed,
      domain,
      title: parsed.title,
      description: parsed.description,
      brand: parsed.brand,
      price: parsed.price,
      currency: parsed.currency,
      color: parsed.color,
      size: parsed.size,
      category: parsed.category,
      extractionMethod: parsed.method,
      confidence: parsed.confidence as unknown as Prisma.InputJsonValue,
      raw: {
        finalUrl: page.finalUrl,
        chosenImageUrl,
        imageCandidates: parsed.imageCandidates.slice(0, 6),
      } as Prisma.InputJsonValue,
    },
  });

  const result: ExtractedProductDto = {
    productSourceId: source.id,
    imageKey,
    imageUrl: stored.url,
    sourceUrl: trimmed,
    domain,
    title: parsed.title,
    description: parsed.description,
    brand: parsed.brand,
    price: parsed.price,
    currency: parsed.currency,
    color: parsed.color,
    size: parsed.size,
    category: parsed.category,
    extractionMethod: parsed.method as ExtractionMethod,
    confidence: parsed.confidence,
  };

  await cacheSet(key, "product-extract", result, CACHE_TTL_SECONDS);
  return result;
}

function directImageParse(finalUrl: string): ParsedProduct {
  return {
    title: null,
    description: null,
    brand: null,
    price: null,
    currency: null,
    color: null,
    size: null,
    category: null,
    imageCandidates: [finalUrl],
    method: "heuristic",
    confidence: { image: 0.9, metadata: 0.2 },
  };
}

function looksLikeHtml(body: Buffer): boolean {
  const head = body.subarray(0, 512).toString("utf8").toLowerCase();
  return head.includes("<html") || head.includes("<!doctype html");
}

async function downloadFirstViableImage(
  candidates: string[],
): Promise<{ imageBuffer: Buffer | null; chosenImageUrl: string | null }> {
  for (const candidate of candidates.slice(0, 4)) {
    try {
      const res = await safeFetch(candidate, {
        maxBytes: IMAGE_MAX_BYTES,
        timeoutMs: 12_000,
        accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      });
      const isImageType = res.contentType.toLowerCase().startsWith("image/");
      if (!isImageType) {
        // Some CDNs serve octet-stream; accept only if sharp can read it.
        try {
          await imageDimensions(res.body);
        } catch {
          continue;
        }
      }
      return { imageBuffer: res.body, chosenImageUrl: candidate };
    } catch {
      continue; // try the next candidate
    }
  }
  return { imageBuffer: null, chosenImageUrl: null };
}
