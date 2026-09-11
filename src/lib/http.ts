import { NextResponse } from "next/server";
import { AppError, normalizeError } from "@/lib/errors";
import { isRateLimitDisabled } from "@/lib/env";
import type { ApiResponse } from "@/types/api";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  const body: ApiResponse<T> = { ok: true, data };
  return NextResponse.json(body, init);
}

export function toErrorResponse(e: unknown): NextResponse {
  const err = normalizeError(e);
  if (err.status >= 500) {
    console.error(`[api] ${err.code}: ${err.message}`, err.cause ?? "");
  }
  const body: ApiResponse<never> = { ok: false, error: { code: err.code, message: err.message } };
  return NextResponse.json(body, { status: err.status });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("INVALID_INPUT", "Request body must be valid JSON.");
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "local";
}

// ── In-memory rate limiting ───────────────────────────────────────────────────
// Fixed-window per key. Suitable for a single instance MVP; swap the store for
// Redis when running multiple instances (the call sites stay identical).

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function enforceRateLimit(
  req: Request,
  opts: { key: string; limit: number; windowMs?: number },
): void {
  if (isRateLimitDisabled()) return;
  const windowMs = opts.windowMs ?? 60_000;
  const key = `${opts.key}:${clientIp(req)}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    bucket.count += 1;
    if (bucket.count > opts.limit) {
      throw new AppError("RATE_LIMITED", undefined, {
        details: { retryAfterMs: bucket.resetAt - now },
      });
    }
  }
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
}
