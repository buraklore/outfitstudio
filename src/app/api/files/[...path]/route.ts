import { NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/http";
import { assertValidKey, getStorage } from "@/services/storage";

export const runtime = "nodejs";

/**
 * GET /api/files/:key — serves stored images when no public CDN base is
 * configured. Keys contain UUIDs and act as capability URLs; traversal is
 * blocked by assertValidKey + the local driver's path guard.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const key = path.join("/");
    assertValidKey(key);
    const { body, contentType } = await getStorage().get(key);
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    return toErrorResponse(e);
  }
}
