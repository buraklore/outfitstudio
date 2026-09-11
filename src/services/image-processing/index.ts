import { createHash } from "node:crypto";
import sharp from "sharp";
import { AppError } from "@/lib/errors";

/**
 * Technical-only image normalization (spec §8): orientation, transparent
 * backgrounds flattened to white, bounded dimensions, consistent JPEG output.
 * The garment itself — color, pattern, logos, cut, texture — is never
 * retouched; anything content-altering (e.g. background removal) is out of
 * scope by design so product fidelity is preserved.
 */

export interface NormalizedImage {
  buffer: Buffer;
  width: number;
  height: number;
  contentType: "image/jpeg";
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function normalizeClothingImage(
  input: Buffer,
  opts?: { maxSide?: number; quality?: number },
): Promise<NormalizedImage> {
  const maxSide = opts?.maxSide ?? 1024;
  const quality = opts?.quality ?? 88;
  try {
    const { data, info } = await sharp(input, { failOn: "none" })
      .rotate() // respect EXIF orientation
      .flatten({ background: "#ffffff" })
      .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height, contentType: "image/jpeg" };
  } catch (e) {
    throw new AppError("IMAGE_UNREADABLE", "The image could not be processed.", { cause: e });
  }
}

/** Smaller variant used as Gemini input to keep vision calls cheap (spec §27). */
export async function toAiInputImage(input: Buffer, maxSide = 768): Promise<NormalizedImage> {
  return normalizeClothingImage(input, { maxSide, quality: 80 });
}

export async function imageDimensions(input: Buffer): Promise<{ width: number; height: number }> {
  try {
    const meta = await sharp(input, { failOn: "none" }).metadata();
    if (!meta.width || !meta.height) throw new Error("missing dimensions");
    return { width: meta.width, height: meta.height };
  } catch (e) {
    throw new AppError("IMAGE_UNREADABLE", "The image could not be read.", { cause: e });
  }
}
