import { NextRequest } from "next/server";
import { getOrCreateUserId } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { enforceRateLimit, ok, toErrorResponse } from "@/lib/http";
import { MAX_UPLOAD_BYTES, MIN_IMAGE_DIMENSION, validateUploadMeta } from "@/lib/validation";
import { normalizeClothingImage, sha256 } from "@/services/image-processing";
import { getStorage, newImageKey } from "@/services/storage";
import type { UploadedImageDto } from "@/types/api";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/uploads — multipart upload of one clothing photo.
 * Validates type/size, normalizes (EXIF rotate, flatten, resize, JPEG),
 * stores the normalized asset and returns its key + URL (spec §7/§26/§27).
 */
export async function POST(req: NextRequest) {
  try {
    enforceRateLimit(req, { key: "uploads", limit: 30 });
    await getOrCreateUserId();

    const form = await req.formData().catch(() => {
      throw new AppError("INVALID_INPUT", 'Expected multipart/form-data with a "file" field.');
    });
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("INVALID_INPUT", 'A "file" field is required.');
    }
    validateUploadMeta({ type: file.type, size: file.size });

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_UPLOAD_BYTES) throw new AppError("IMAGE_TOO_LARGE");

    const normalized = await normalizeClothingImage(buffer);
    if (normalized.width < MIN_IMAGE_DIMENSION || normalized.height < MIN_IMAGE_DIMENSION) {
      throw new AppError(
        "IMAGE_UNREADABLE",
        "The image is too small — please use at least 200×200 pixels.",
      );
    }

    const imageKey = newImageKey("uploads");
    const stored = await getStorage().put(imageKey, normalized.buffer, "image/jpeg");
    const dto: UploadedImageDto = {
      imageKey,
      url: stored.url,
      width: normalized.width,
      height: normalized.height,
      sha256: sha256(normalized.buffer),
    };
    return ok(dto);
  } catch (e) {
    return toErrorResponse(e);
  }
}
