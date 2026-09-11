import * as cheerio from "cheerio";

/**
 * Extracts product data from an HTML document (spec §5), in priority order:
 *   1. JSON-LD `Product` schema  (highest confidence)
 *   2. Open Graph / Twitter meta (good confidence)
 *   3. Heuristic fallback        (low confidence — user confirmation expected)
 *
 * Pure and side-effect free so it is directly unit-testable against fixtures.
 */

export type ExtractionMethod = "json-ld" | "opengraph" | "heuristic";

export interface ParsedProduct {
  title: string | null;
  description: string | null;
  brand: string | null;
  price: number | null;
  currency: string | null;
  color: string | null;
  size: string | null;
  category: string | null;
  /** Best image first. Absolute URLs only. */
  imageCandidates: string[];
  method: ExtractionMethod;
  confidence: { image: number; metadata: number };
}

function resolveUrl(candidate: unknown, baseUrl: string): string | null {
  if (typeof candidate !== "string" || !candidate.trim()) return null;
  try {
    const url = new URL(candidate.trim(), baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

/** JSON-LD image can be a string, ImageObject, or arrays of either. */
function imageStrings(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((v) => imageStrings(v));
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return imageStrings(obj.url ?? obj.contentUrl ?? obj["@id"]);
  }
  return [];
}

/** Handles "1299.90", "1.299,90", "1,299.90", "1299,90 TL" … */
export function parsePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  let s = value.replace(/[^\d.,-]/g, "").trim();
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // The later separator is the decimal one.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    s = decimals === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot > -1) {
    const decimals = s.length - lastDot - 1;
    const dotCount = (s.match(/\./g) ?? []).length;
    // "2.450" / "1.299.900" are thousand separators; "1299.90" stays decimal.
    if (decimals === 3 || dotCount > 1) s = s.replace(/\./g, "");
  }
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

interface JsonLdProduct {
  title: string | null;
  description: string | null;
  brand: string | null;
  price: number | null;
  currency: string | null;
  color: string | null;
  size: string | null;
  category: string | null;
  images: string[];
}

function isProductNode(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object") return false;
  const type = (node as Record<string, unknown>)["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some(
    (t) => typeof t === "string" && /(^|\/)(Product|ProductGroup|IndividualProduct)$/i.test(t),
  );
}

function* jsonLdNodes(root: unknown): Generator<Record<string, unknown>> {
  if (!root || typeof root !== "object") return;
  if (Array.isArray(root)) {
    for (const item of root) yield* jsonLdNodes(item);
    return;
  }
  const obj = root as Record<string, unknown>;
  yield obj;
  if (Array.isArray(obj["@graph"])) {
    for (const item of obj["@graph"]) yield* jsonLdNodes(item);
  }
}

function extractJsonLd($: cheerio.CheerioAPI, baseUrl: string): JsonLdProduct | null {
  const scripts = $('script[type="application/ld+json"]');
  for (const el of scripts.toArray()) {
    const rawText = $(el).text();
    if (!rawText?.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      continue;
    }
    for (const node of jsonLdNodes(parsed)) {
      if (!isProductNode(node)) continue;

      const brandValue = node.brand;
      const brand =
        asString(brandValue) ??
        asString((brandValue as Record<string, unknown> | undefined)?.name);

      let price: number | null = null;
      let currency: string | null = null;
      const offersValue = node.offers;
      const offers = Array.isArray(offersValue) ? offersValue : offersValue ? [offersValue] : [];
      for (const offer of offers) {
        if (!offer || typeof offer !== "object") continue;
        const o = offer as Record<string, unknown>;
        price = parsePrice(o.price ?? o.lowPrice ?? o.highPrice);
        currency = asString(o.priceCurrency) ?? currency;
        if (price != null) break;
      }

      const sizeValue = node.size;
      const size =
        asString(sizeValue) ?? asString((sizeValue as Record<string, unknown> | undefined)?.name);

      const images = imageStrings(node.image)
        .map((u) => resolveUrl(u, baseUrl))
        .filter((u): u is string => !!u);

      return {
        title: asString(node.name),
        description: asString(node.description),
        brand,
        price,
        currency,
        color: asString(node.color),
        size,
        category: asString(node.category),
        images,
      };
    }
  }
  return null;
}

interface OgData {
  title: string | null;
  description: string | null;
  brand: string | null;
  price: number | null;
  currency: string | null;
  images: string[];
}

function meta($: cheerio.CheerioAPI, selector: string): string | null {
  return asString($(selector).first().attr("content"));
}

function extractOpenGraph($: cheerio.CheerioAPI, baseUrl: string): OgData {
  const images: string[] = [];
  const push = (value: string | null | undefined) => {
    const resolved = resolveUrl(value, baseUrl);
    if (resolved && !images.includes(resolved)) images.push(resolved);
  };
  $('meta[property="og:image:secure_url"], meta[property="og:image"]').each((_, el) =>
    push($(el).attr("content")),
  );
  push(meta($, 'meta[name="twitter:image"]'));
  push(meta($, 'meta[name="twitter:image:src"]'));
  push(meta($, 'link[rel="image_src"][href]') ?? $('link[rel="image_src"]').attr("href"));

  return {
    title: meta($, 'meta[property="og:title"]') ?? meta($, 'meta[name="twitter:title"]'),
    description:
      meta($, 'meta[property="og:description"]') ?? meta($, 'meta[name="twitter:description"]'),
    brand: meta($, 'meta[property="product:brand"]') ?? meta($, 'meta[property="og:brand"]'),
    price: parsePrice(
      meta($, 'meta[property="product:price:amount"]') ??
        meta($, 'meta[property="og:price:amount"]'),
    ),
    currency:
      meta($, 'meta[property="product:price:currency"]') ??
      meta($, 'meta[property="og:price:currency"]'),
    images,
  };
}

const IMG_SKIP = /(\.svg($|\?))|sprite|icon|logo|placeholder|pixel|blank|avatar|badge|flag/i;

function heuristicImages($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const images: string[] = [];
  $("img[src]").each((_, el) => {
    if (images.length >= 5) return;
    const src = $(el).attr("src") ?? "";
    if (src.startsWith("data:") || IMG_SKIP.test(src)) return;
    const width = Number($(el).attr("width") ?? 0);
    const height = Number($(el).attr("height") ?? 0);
    if ((width && width < 200) || (height && height < 200)) return;
    const resolved = resolveUrl(src, baseUrl);
    if (resolved && !images.includes(resolved)) images.push(resolved);
  });
  return images;
}

export function parseProductHtml(html: string, baseUrl: string): ParsedProduct {
  const $ = cheerio.load(html);

  const jsonLd = extractJsonLd($, baseUrl);
  const og = extractOpenGraph($, baseUrl);

  const title = jsonLd?.title ?? og.title ?? asString($("title").first().text());
  const description =
    jsonLd?.description ?? og.description ?? meta($, 'meta[name="description"]');
  const brand = jsonLd?.brand ?? og.brand;
  const price = jsonLd?.price ?? og.price;
  const currency = jsonLd?.currency ?? og.currency;

  let imageCandidates: string[] = [];
  let method: ExtractionMethod;
  let imageConfidence = 0;

  if (jsonLd && jsonLd.images.length > 0) {
    imageCandidates = [...jsonLd.images, ...og.images.filter((u) => !jsonLd.images.includes(u))];
    method = "json-ld";
    imageConfidence = 0.95;
  } else if (og.images.length > 0) {
    imageCandidates = og.images;
    method = jsonLd ? "json-ld" : "opengraph";
    imageConfidence = 0.85;
  } else {
    imageCandidates = heuristicImages($, baseUrl);
    method = jsonLd ? "json-ld" : "heuristic";
    imageConfidence = imageCandidates.length > 0 ? 0.5 : 0;
  }

  const metadataConfidence = jsonLd ? 0.95 : og.title || og.images.length ? 0.7 : 0.4;

  return {
    title,
    description,
    brand,
    price,
    currency,
    color: jsonLd?.color ?? null,
    size: jsonLd?.size ?? null,
    category: jsonLd?.category ?? null,
    imageCandidates,
    method,
    confidence: { image: imageConfidence, metadata: metadataConfidence },
  };
}
