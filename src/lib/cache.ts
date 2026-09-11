import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Content-addressed cache backed by Postgres (spec §27). The same URL or the
 * same image hash is never sent to Gemini twice while the entry is fresh.
 * Cache failures never break the request flow — they only cost a re-compute.
 */

export function cacheKey(...parts: Array<string | number>): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const row = await prisma.analysisCache.findUnique({ where: { cacheKey: key } });
    if (!row) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      prisma.analysisCache.delete({ where: { cacheKey: key } }).catch(() => undefined);
      return null;
    }
    return row.payload as T;
  } catch (e) {
    console.warn("[cache] read failed", e);
    return null;
  }
}

export async function cacheSet(
  key: string,
  kind: string,
  payload: unknown,
  ttlSeconds?: number,
): Promise<void> {
  try {
    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;
    const value = payload as Prisma.InputJsonValue;
    await prisma.analysisCache.upsert({
      where: { cacheKey: key },
      update: { payload: value, kind, expiresAt },
      create: { cacheKey: key, kind, payload: value, expiresAt },
    });
  } catch (e) {
    console.warn("[cache] write failed", e);
  }
}
