import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@/lib/errors";

/**
 * SSRF protection for user-supplied URLs (spec §26).
 *
 * Guarantees before any outbound request:
 *   - protocol is http/https, port is 80/443/default
 *   - hostname is not a local/internal name (localhost, *.local, *.internal, …)
 *   - every resolved IP (IPv4 and IPv6) is public — loopback, RFC1918,
 *     link-local (incl. the 169.254.169.254 cloud metadata endpoint), CGNAT,
 *     unique-local, multicast and reserved ranges are all rejected
 *   - redirects are followed manually and every hop is re-validated
 *   - responses are size-capped and time-limited
 *
 * Residual risk: DNS answers are checked before fetch() re-resolves, so a
 * malicious authoritative server could attempt DNS rebinding in that window.
 * Mitigate in hardened deployments by running the fetcher in an egress-
 * restricted network or pinning connections with a custom undici Agent.
 */

export type LookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: LookupFn = async (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata",
]);

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".home.arpa", ".lan"];

const ALLOWED_PORTS = new Set(["", "80", "443"]);

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b, c] = parts as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24, 192.0.2.0/24
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

export function isPrivateIPv6(raw: string): boolean {
  const ip = raw.toLowerCase().split("%")[0]!;
  if (ip === "::" || ip === "::1") return true; // unspecified / loopback
  // IPv4-mapped (::ffff:a.b.c.d) — judge by the embedded IPv4.
  const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) return isPrivateIPv4(v4[1]!);
  if (ip.startsWith("::")) return true; // other ::-prefixed compressions are suspicious
  const first = ip.split(":")[0]!;
  if (/^f[cd]/.test(first)) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(first)) return true; // fe80::/10 link-local
  if (/^ff/.test(first)) return true; // multicast
  if (ip.startsWith("2001:db8")) return true; // documentation
  if (ip.startsWith("64:ff9b")) return true; // NAT64 well-known prefix
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true;
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
}

/**
 * Validates a user-supplied URL and resolves DNS to make sure it points at a
 * public address. Throws AppError("URL_BLOCKED") otherwise.
 */
export async function assertSafeUrl(
  rawUrl: string,
  opts?: { lookup?: LookupFn },
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new AppError("URL_BLOCKED", "This is not a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("URL_BLOCKED", "Only http(s) URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new AppError("URL_BLOCKED", "URLs with embedded credentials are not allowed.");
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new AppError("URL_BLOCKED", "This port is not allowed.");
  }

  const hostname = stripBrackets(url.hostname).toLowerCase();
  if (!hostname) throw new AppError("URL_BLOCKED", "This is not a valid URL.");
  if (BLOCKED_HOSTNAMES.has(hostname) || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    throw new AppError("URL_BLOCKED", "Internal hostnames are not allowed.");
  }

  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new AppError("URL_BLOCKED", "This address is not allowed.");
    }
    return url;
  }

  const lookup = opts?.lookup ?? defaultLookup;
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname);
  } catch {
    throw new AppError("URL_FETCH_FAILED", "The host could not be resolved.");
  }
  if (!addresses.length) {
    throw new AppError("URL_FETCH_FAILED", "The host could not be resolved.");
  }
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new AppError("URL_BLOCKED", "This address resolves to a private network.");
    }
  }
  return url;
}

export interface SafeFetchOptions {
  /** Hard cap on the downloaded body. */
  maxBytes: number;
  timeoutMs?: number;
  accept?: string;
  maxRedirects?: number;
  lookup?: LookupFn;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  contentType: string;
  body: Buffer;
}

const USER_AGENT =
  "Mozilla/5.0 (compatible; OutfitStudioBot/1.0; +https://example.com/bot) product-preview-fetcher";

/**
 * Fetches a URL with SSRF validation on every redirect hop, a timeout and a
 * byte cap. Never follows redirects automatically.
 */
export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const maxRedirects = opts.maxRedirects ?? 4;

  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertSafeUrl(current, { lookup: opts.lookup });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: opts.accept ?? "*/*",
          "accept-language": "en,tr;q=0.8",
        },
      });
    } catch (e) {
      clearTimeout(timer);
      const timedOut = e instanceof Error && e.name === "AbortError";
      throw new AppError(
        "URL_FETCH_FAILED",
        timedOut ? "The request timed out." : "The page could not be reached.",
        { cause: e },
      );
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      clearTimeout(timer);
      res.body?.cancel().catch(() => undefined);
      const location = res.headers.get("location");
      if (!location) throw new AppError("URL_FETCH_FAILED", "Broken redirect.");
      current = new URL(location, url).toString();
      continue;
    }

    if (res.status >= 400) {
      clearTimeout(timer);
      res.body?.cancel().catch(() => undefined);
      throw new AppError("URL_FETCH_FAILED", `The page responded with status ${res.status}.`);
    }

    const declaredLength = Number(res.headers.get("content-length") ?? 0);
    if (declaredLength > opts.maxBytes) {
      clearTimeout(timer);
      res.body?.cancel().catch(() => undefined);
      throw new AppError("URL_FETCH_FAILED", "The response is too large.");
    }

    try {
      const body = await readCapped(res, opts.maxBytes);
      return {
        finalUrl: url.toString(),
        status: res.status,
        contentType: res.headers.get("content-type") ?? "",
        body,
      };
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("URL_FETCH_FAILED", "The response could not be read.", { cause: e });
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AppError("URL_FETCH_FAILED", "Too many redirects.");
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  if (!res.body) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new AppError("URL_FETCH_FAILED", "The response is too large.");
    }
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AppError("URL_FETCH_FAILED", "The response is too large.");
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks);
}
