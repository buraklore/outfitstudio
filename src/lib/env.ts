import { z } from "zod";
import { AppError } from "@/lib/errors";

/**
 * All environment access goes through here. Model names are env-driven
 * (spec §4) so upgrading a Gemini model never touches application code.
 * Defaults reflect the Gemini API docs as of Sept 2026.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),

  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_TEXT_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  GEMINI_VISION_MODEL: z.string().min(1).default("gemini-3.8-flash"),
  GEMINI_IMAGE_MODEL: z.string().min(1).default("gemini-3.1-flash-image"),

  ANALYSIS_LOCALE: z.enum(["tr", "en"]).default("tr"),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_URL: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_PUBLIC_URL: z.string().optional(),

  RATE_LIMIT_DISABLED: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) cached = envSchema.parse(process.env);
  return cached;
}

/** Throws a clear, actionable error instead of a cryptic SDK failure. */
export function requireGeminiKey(): string {
  const key = getEnv().GEMINI_API_KEY;
  if (!key) {
    throw new AppError(
      "AI_UNAVAILABLE",
      "GEMINI_API_KEY is not configured on the server.",
    );
  }
  return key;
}

export function isRateLimitDisabled(): boolean {
  return getEnv().RATE_LIMIT_DISABLED === "1";
}
