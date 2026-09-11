import type { z } from "zod";
import { AppError } from "@/lib/errors";

/**
 * Defensive parsing for model output (spec §23). Even with schema-constrained
 * responses, we tolerate markdown fences and stray prose around the JSON.
 */

export function extractJson(raw: string): string {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) text = fenced[1].trim();

  const starts = [text.indexOf("{"), text.indexOf("[")].filter((i) => i >= 0);
  if (starts.length === 0) return text;
  const start = Math.min(...starts);
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  const end = text.lastIndexOf(closer);
  if (end > start) return text.slice(start, end + 1);
  return text;
}

export function parseJsonLoose(raw: string): unknown {
  const candidate = extractJson(raw);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    throw new AppError("AI_PARSE_FAILED", "The AI response was not valid JSON.", {
      details: { snippet: candidate.slice(0, 300) },
      cause: e,
    });
  }
}

export function parseWithSchema<T>(raw: string, schema: z.ZodType<T>): T {
  const value = parseJsonLoose(raw);
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("AI_PARSE_FAILED", "The AI response did not match the expected schema.", {
      details: result.error.issues,
    });
  }
  return result.data;
}
