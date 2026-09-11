import { GoogleGenAI } from "@google/genai";
import type { z } from "zod";
import { getEnv, requireGeminiKey } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { parseWithSchema } from "@/services/gemini/structured";

/**
 * Thin wrapper around the Gemini **Interactions API** (`@google/genai` v2,
 * `client.interactions.create`) — the current primary API; `generateContent`
 * is documented as legacy. Verified against the official docs, Sept 2026:
 *   - structured output: response_format { type:"text", mime_type:"application/json", schema }
 *   - image generation:  response_format { type:"image", aspect_ratio, image_size }
 *   - multi-image input: content blocks { type:"image", mime_type, data(base64) }
 *   - determinism knobs: generation_config.seed (temperature is not part of
 *     the Interactions generation_config, so consistency relies on the seed
 *     plus a fixed rubric — see outfit-analysis).
 *
 * Nothing else is assumed about the API (spec §41). All model names come from
 * env (spec §4) via getModels().
 */

export type AiTextBlock = { type: "text"; text: string };
export type AiImageBlock = { type: "image"; mime_type: string; data: string };
export type AiBlock = AiTextBlock | AiImageBlock;

export function textBlock(text: string): AiTextBlock {
  return { type: "text", text };
}

export function imageBlockFromBuffer(buffer: Buffer, mimeType: string): AiImageBlock {
  return { type: "image", mime_type: mimeType, data: buffer.toString("base64") };
}

/** Minimal structural view of an Interaction response used by this app. */
interface InteractionContentBlock {
  type?: string;
  text?: string;
  data?: string;
  mime_type?: string;
}
interface InteractionStep {
  type?: string;
  content?: InteractionContentBlock[];
}
interface InteractionResult {
  status?: string;
  output_text?: string;
  output_image?: { data?: string; mime_type?: string };
  steps?: InteractionStep[];
}

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = requireGeminiKey();
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

export function getModels(): { text: string; vision: string; image: string } {
  const env = getEnv();
  return {
    text: env.GEMINI_TEXT_MODEL,
    vision: env.GEMINI_VISION_MODEL,
    image: env.GEMINI_IMAGE_MODEL,
  };
}

function mapGeminiError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const err = e as { status?: unknown; code?: unknown; name?: string; message?: string };
  const status =
    typeof err?.status === "number"
      ? err.status
      : typeof err?.code === "number"
        ? err.code
        : undefined;
  if (status === 429) return new AppError("AI_RATE_LIMITED", undefined, { cause: e });
  if (status === 401 || status === 403) {
    return new AppError("AI_UNAVAILABLE", "The Gemini API key was rejected.", { cause: e });
  }
  if (err?.name === "AbortError" || /timed? ?out/i.test(err?.message ?? "")) {
    return new AppError("AI_UNAVAILABLE", "The AI request timed out.", { status: 504, cause: e });
  }
  return new AppError("AI_UNAVAILABLE", undefined, { cause: e });
}

export interface StructuredCallOptions<T> {
  model: string;
  input: AiBlock[] | string;
  /** Fixed instruction (rubrics, taxonomies) — kept out of the user turn. */
  system?: string;
  /** JSON Schema handed to the API as response_format.schema. */
  schema: Record<string, unknown>;
  /** Zod schema used to validate the parsed response (spec §23/§43). */
  zodSchema: z.ZodType<T>;
  seed?: number;
  maxOutputTokens?: number;
}

/** One structured JSON call: schema-constrained output + zod validation. */
export async function generateStructured<T>(opts: StructuredCallOptions<T>): Promise<T> {
  const ai = getGeminiClient();
  let interaction: InteractionResult;
  try {
    interaction = (await ai.interactions.create({
      model: opts.model,
      input: opts.input,
      ...(opts.system ? { system_instruction: opts.system } : {}),
      generation_config: {
        ...(opts.seed != null ? { seed: opts.seed } : {}),
        ...(opts.maxOutputTokens ? { max_output_tokens: opts.maxOutputTokens } : {}),
      },
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: opts.schema,
      },
    })) as unknown as InteractionResult;
  } catch (e) {
    throw mapGeminiError(e);
  }

  const text = interaction.output_text?.trim() || collectText(interaction);
  if (!text) {
    throw new AppError("AI_PARSE_FAILED", "The model returned no text output.", {
      details: { status: interaction.status },
    });
  }
  return parseWithSchema(text, opts.zodSchema);
}

function collectText(interaction: InteractionResult): string {
  const parts: string[] = [];
  for (const step of interaction.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content ?? []) {
      if (block.type === "text" && block.text) parts.push(block.text);
    }
  }
  return parts.join("\n").trim();
}

export interface ImageCallOptions {
  model: string;
  input: AiBlock[];
  /** e.g. "3:4" for a full-body catalog frame. */
  aspectRatio?: string;
  imageSize?: "512" | "1K" | "2K" | "4K";
}

export interface GeneratedImageResult {
  data: Buffer;
  mimeType: string;
  modelText?: string;
}

/** One image-generation call. Returns the final rendered image bytes. */
export async function generateImage(opts: ImageCallOptions): Promise<GeneratedImageResult> {
  const ai = getGeminiClient();
  let interaction: InteractionResult;
  try {
    interaction = (await ai.interactions.create({
      model: opts.model,
      input: opts.input,
      // NOTE: the Interactions API currently only supports image/jpeg output;
      // sending mime_type "image/png" is rejected with 400 invalid_request,
      // so we omit mime_type and read the actual type from the response.
      response_format: {
        type: "image",
        ...(opts.aspectRatio ? { aspect_ratio: opts.aspectRatio } : {}),
        ...(opts.imageSize ? { image_size: opts.imageSize } : {}),
      },
    })) as unknown as InteractionResult;
  } catch (e) {
    throw mapGeminiError(e);
  }

  const image =
    interaction.output_image?.data != null ? interaction.output_image : findImageBlock(interaction);
  if (!image?.data) {
    throw new AppError("GENERATION_FAILED", "The model returned no image.", {
      details: { status: interaction.status },
    });
  }
  return {
    data: Buffer.from(image.data, "base64"),
    mimeType: image.mime_type ?? "image/jpeg",
    modelText: interaction.output_text ?? undefined,
  };
}

function findImageBlock(
  interaction: InteractionResult,
): { data?: string; mime_type?: string } | null {
  for (const step of interaction.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content ?? []) {
      if (block.type === "image" && block.data) return block;
    }
  }
  return null;
}
