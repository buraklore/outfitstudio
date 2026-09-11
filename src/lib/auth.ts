import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

/**
 * Anonymous, cookie-based identity for the MVP. Every write path attributes
 * data to a User row, so plugging in a real auth provider later only means
 * replacing the body of these two functions (spec §3, "modular auth").
 */

const COOKIE_NAME = "os_uid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Route handlers only (may set a cookie). */
export async function getOrCreateUserId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) {
    const user = await prisma.user.upsert({
      where: { anonymousId: existing },
      update: {},
      create: { anonymousId: existing },
    });
    return user.id;
  }
  const anonymousId = randomUUID();
  store.set(COOKIE_NAME, anonymousId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  const user = await prisma.user.create({ data: { anonymousId } });
  return user.id;
}

/** Safe in server components (read-only). */
export async function getUserIdIfExists(): Promise<string | null> {
  const store = await cookies();
  const anonymousId = store.get(COOKIE_NAME)?.value;
  if (!anonymousId) return null;
  const user = await prisma.user.findUnique({ where: { anonymousId } });
  return user?.id ?? null;
}
