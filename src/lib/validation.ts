import { z } from "zod";
import { AppError } from "@/lib/errors";
import { CLOTHING_CATEGORIES } from "@/types/clothing";
import { MANNEQUIN_TYPES, STYLE_PRESETS } from "@/types/outfit";

// ── Uploads ───────────────────────────────────────────────────────────────────

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const MIN_IMAGE_DIMENSION = 200; // px
export const ALLOWED_UPLOAD_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export function validateUploadMeta(meta: { type: string; size: number }): void {
  if (!(ALLOWED_UPLOAD_MIME as readonly string[]).includes(meta.type)) {
    throw new AppError(
      "UNSUPPORTED_FILE",
      "Only JPEG, PNG, WEBP and AVIF images are supported.",
    );
  }
  if (meta.size <= 0) {
    throw new AppError("UNSUPPORTED_FILE", "The uploaded file is empty.");
  }
  if (meta.size > MAX_UPLOAD_BYTES) {
    throw new AppError("IMAGE_TOO_LARGE", "Images must be 10 MB or smaller.");
  }
}

// ── Request schemas ───────────────────────────────────────────────────────────

export const imageKeySchema = z
  .string()
  .min(6)
  .max(240)
  .regex(/^[a-zA-Z0-9/_.-]+$/, "Invalid image key")
  .refine((k) => !k.includes("..") && !k.startsWith("/") && !k.endsWith("/"), {
    message: "Invalid image key",
  })
  .refine((k) => /^(uploads|products|outfits)\//.test(k), { message: "Invalid image key" });

export const extractRequestSchema = z.object({
  url: z.string().min(8, "Enter a product URL").max(2048),
});

export const analyzeRequestSchema = z.object({
  locale: z.enum(["tr", "en"]).catch("tr").default("tr"),
  images: z
    .array(
      z.object({
        imageKey: imageKeySchema,
        slotHint: z.string().max(40).optional(),
      }),
    )
    .min(1)
    .max(8),
});

export const outfitItemInputSchema = z.object({
  imageKey: imageKeySchema,
  category: z.enum(CLOTHING_CATEGORIES),
  subcategory: z.string().max(80).nullish(),
  color: z.string().max(60).nullish(),
  secondaryColors: z.array(z.string().max(40)).max(6).optional(),
  pattern: z.string().max(60).nullish(),
  material: z.string().max(160).nullish(),
  fit: z.string().max(60).nullish(),
  style: z.string().max(60).nullish(),
  season: z.string().max(40).nullish(),
  formality: z.string().max(40).nullish(),
  genderPresentation: z.string().max(40).nullish(),
  description: z.string().max(600).nullish(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.enum(["URL", "UPLOAD"]),
  sourceUrl: z.url().max(2048).optional(),
  productSourceId: z.string().max(60).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createOutfitSchema = z.object({
  locale: z.enum(["tr", "en"]).catch("tr").default("tr"),
  mannequinType: z.enum(MANNEQUIN_TYPES).default("NEUTRAL"),
  stylePreset: z.enum(STYLE_PRESETS).default("auto"),
  items: z.array(outfitItemInputSchema).min(2, "Add at least two items").max(8),
});

export type OutfitItemInput = z.infer<typeof outfitItemInputSchema>;
export type CreateOutfitInput = z.infer<typeof createOutfitSchema>;
