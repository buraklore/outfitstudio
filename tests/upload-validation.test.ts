import { describe, expect, it } from "vitest";
import {
  createOutfitSchema,
  imageKeySchema,
  MAX_UPLOAD_BYTES,
  validateUploadMeta,
} from "@/lib/validation";
import { AppError } from "@/lib/errors";

function codeOf(fn: () => void): string {
  try {
    fn();
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : "OTHER";
  }
}

describe("validateUploadMeta", () => {
  it("accepts supported types under the cap", () => {
    expect(codeOf(() => validateUploadMeta({ type: "image/jpeg", size: 1024 }))).toBe("OK");
    expect(codeOf(() => validateUploadMeta({ type: "image/webp", size: 5_000_000 }))).toBe("OK");
  });

  it("rejects unsupported types, empty files and oversize files", () => {
    expect(codeOf(() => validateUploadMeta({ type: "image/gif", size: 1024 }))).toBe(
      "UNSUPPORTED_FILE",
    );
    expect(codeOf(() => validateUploadMeta({ type: "application/pdf", size: 1024 }))).toBe(
      "UNSUPPORTED_FILE",
    );
    expect(codeOf(() => validateUploadMeta({ type: "image/jpeg", size: 0 }))).toBe(
      "UNSUPPORTED_FILE",
    );
    expect(
      codeOf(() => validateUploadMeta({ type: "image/jpeg", size: MAX_UPLOAD_BYTES + 1 })),
    ).toBe("IMAGE_TOO_LARGE");
  });
});

describe("imageKeySchema", () => {
  it("accepts generated keys and rejects traversal", () => {
    expect(
      imageKeySchema.safeParse("uploads/2026/09/2f9d1f2a-1111-4222-8333-444455556666.jpg").success,
    ).toBe(true);
    expect(imageKeySchema.safeParse("../etc/passwd").success).toBe(false);
    expect(imageKeySchema.safeParse("uploads/../../secret.jpg").success).toBe(false);
    expect(imageKeySchema.safeParse("uploads/a b.jpg").success).toBe(false);
  });
});

describe("createOutfitSchema", () => {
  const item = {
    imageKey: "uploads/2026/09/2f9d1f2a-1111-4222-8333-444455556666.jpg",
    category: "tshirt",
    source: "UPLOAD",
  };

  it("requires 2–8 items", () => {
    expect(
      createOutfitSchema.safeParse({ items: [item], mannequinType: "NEUTRAL" }).success,
    ).toBe(false);
    expect(
      createOutfitSchema.safeParse({ items: [item, item], mannequinType: "NEUTRAL" }).success,
    ).toBe(true);
    expect(
      createOutfitSchema.safeParse({
        items: Array.from({ length: 9 }, () => item),
        mannequinType: "NEUTRAL",
      }).success,
    ).toBe(false);
  });
});
