import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, httpStatusFor, normalizeError } from "@/lib/errors";

describe("normalizeError", () => {
  it("passes AppError through untouched", () => {
    const original = new AppError("URL_BLOCKED");
    expect(normalizeError(original)).toBe(original);
  });

  it("maps ZodError to INVALID_INPUT with the failing path", () => {
    const schema = z.object({ url: z.url() });
    const result = schema.safeParse({ url: "nope" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const err = normalizeError(result.error);
      expect(err.code).toBe("INVALID_INPUT");
      expect(err.status).toBe(400);
      expect(err.message).toContain("url");
    }
  });

  it("wraps unknown errors as INTERNAL without leaking internals", () => {
    const err = normalizeError(new Error("secret database string"));
    expect(err.code).toBe("INTERNAL");
    expect(err.status).toBe(500);
    expect(err.message).not.toContain("secret");
  });

  it("handles non-Error throws", () => {
    expect(normalizeError("boom").code).toBe("INTERNAL");
  });
});

describe("httpStatusFor", () => {
  it("maps canonical codes", () => {
    expect(httpStatusFor("NOT_FOUND")).toBe(404);
    expect(httpStatusFor("RATE_LIMITED")).toBe(429);
    expect(httpStatusFor("INVALID_INPUT")).toBe(400);
    expect(httpStatusFor("INTERNAL")).toBe(500);
    expect(new AppError("GENERATION_FAILED").status).toBe(httpStatusFor("GENERATION_FAILED"));
  });
});
