import { describe, expect, it } from "vitest";
import { z } from "zod";
import { extractJson, parseWithSchema } from "@/services/gemini/structured";
import { AppError } from "@/lib/errors";

const schema = z.object({ score: z.number(), label: z.string() });

describe("extractJson / parseWithSchema", () => {
  it("parses fenced JSON", () => {
    const raw = "```json\n{\"score\": 87, \"label\": \"Excellent\"}\n```";
    expect(parseWithSchema(raw, schema)).toEqual({ score: 87, label: "Excellent" });
  });

  it("parses JSON wrapped in prose", () => {
    const raw = 'Sure! Here is the result: {"score": 74, "label": "Good"} Hope that helps.';
    expect(parseWithSchema(raw, schema)).toEqual({ score: 74, label: "Good" });
  });

  it("extractJson slices the outermost object", () => {
    expect(extractJson('noise {"a":{"b":1}} trailing')).toBe('{"a":{"b":1}}');
  });

  it("throws AI_PARSE_FAILED for non-JSON and schema mismatches", () => {
    for (const raw of ["not json at all", '{"score":"high","label":3}']) {
      try {
        parseWithSchema(raw, schema);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).code).toBe("AI_PARSE_FAILED");
      }
    }
  });
});
