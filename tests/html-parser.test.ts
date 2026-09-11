import { describe, expect, it } from "vitest";
import { parsePrice, parseProductHtml } from "@/services/product-extraction/html-parser";

const BASE = "https://shop.example.com/products/oversized-shirt";

describe("parsePrice", () => {
  it("handles TR and EN separators", () => {
    expect(parsePrice("1.299,90")).toBeCloseTo(1299.9);
    expect(parsePrice("1,299.90")).toBeCloseTo(1299.9);
    expect(parsePrice("1299,90 TL")).toBeCloseTo(1299.9);
    expect(parsePrice("₺2.450")).toBe(2450);
    expect(parsePrice(349.5)).toBe(349.5);
    expect(parsePrice("1,299")).toBe(1299);
    expect(parsePrice("abc")).toBeNull();
  });
});

describe("parseProductHtml — JSON-LD", () => {
  it("extracts a Product inside @graph with offers and relative image", () => {
    const html = `<!doctype html><html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"BreadcrumbList"},
        {"@type":"Product","name":"Oversized Beige Shirt",
         "description":"Relaxed fit cotton-blend shirt.",
         "brand":{"@type":"Brand","name":"Studio Basics"},
         "image":[{"@type":"ImageObject","url":"/img/shirt-front.jpg"}],
         "color":"Beige","size":"M",
         "offers":{"@type":"Offer","price":"1.299,90","priceCurrency":"TRY"}}
      ]}
      </script></head><body></body></html>`;
    const parsed = parseProductHtml(html, BASE);
    expect(parsed.method).toBe("json-ld");
    expect(parsed.title).toBe("Oversized Beige Shirt");
    expect(parsed.brand).toBe("Studio Basics");
    expect(parsed.price).toBeCloseTo(1299.9);
    expect(parsed.currency).toBe("TRY");
    expect(parsed.imageCandidates[0]).toBe("https://shop.example.com/img/shirt-front.jpg");
    expect(parsed.confidence.image).toBeGreaterThanOrEqual(0.9);
  });
});

describe("parseProductHtml — OpenGraph fallback", () => {
  it("uses og tags when no JSON-LD exists", () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Straight Leg Jeans" />
      <meta property="og:image" content="https://cdn.example.com/jeans.jpg" />
      <meta property="product:price:amount" content="899" />
      <meta property="product:price:currency" content="TRY" />
      </head><body></body></html>`;
    const parsed = parseProductHtml(html, BASE);
    expect(parsed.method).toBe("opengraph");
    expect(parsed.title).toBe("Straight Leg Jeans");
    expect(parsed.imageCandidates[0]).toBe("https://cdn.example.com/jeans.jpg");
    expect(parsed.price).toBe(899);
  });
});

describe("parseProductHtml — heuristic fallback", () => {
  it("collects large in-page images and skips sprites/logos", () => {
    const html = `<!doctype html><html><head><title>Sneaker page</title></head><body>
      <img src="/logo.svg" width="600" height="600" />
      <img src="/assets/sprite.png" width="800" height="800" />
      <img src="/media/sneaker-main.jpg" width="900" height="900" />
      <img src="/media/tiny.jpg" width="80" height="80" />
      </body></html>`;
    const parsed = parseProductHtml(html, BASE);
    expect(parsed.method).toBe("heuristic");
    expect(parsed.imageCandidates).toContain("https://shop.example.com/media/sneaker-main.jpg");
    expect(parsed.imageCandidates.find((u) => u.includes("logo"))).toBeUndefined();
    expect(parsed.imageCandidates.find((u) => u.includes("sprite"))).toBeUndefined();
    expect(parsed.imageCandidates.find((u) => u.includes("tiny"))).toBeUndefined();
  });
});
