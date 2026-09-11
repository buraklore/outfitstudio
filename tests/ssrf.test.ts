import { describe, expect, it, vi, afterEach } from "vitest";
import {
  assertSafeUrl,
  isPrivateIPv4,
  isPrivateIPv6,
  safeFetch,
  type LookupFn,
} from "@/lib/security/ssrf";
import { AppError } from "@/lib/errors";

const publicLookup: LookupFn = async () => [{ address: "93.184.216.34", family: 4 }];
const privateLookup: LookupFn = async () => [{ address: "10.0.0.5", family: 4 }];

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : "OTHER";
  }
}

describe("isPrivateIPv4 / isPrivateIPv6", () => {
  it("flags private and special ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
    ]) {
      expect(isPrivateIPv4(ip), ip).toBe(true);
    }
    expect(isPrivateIPv4("93.184.216.34")).toBe(false);
    expect(isPrivateIPv4("172.32.0.1")).toBe(false);
  });

  it("flags private IPv6 ranges", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12::1", "fe80::1", "ff02::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateIPv6(ip), ip).toBe(true);
    }
    expect(isPrivateIPv6("2606:2800:220:1::1")).toBe(false);
  });
});

describe("assertSafeUrl", () => {
  it("accepts a public https URL", async () => {
    const url = await assertSafeUrl("https://example.com/product", { lookup: publicLookup });
    expect(url.hostname).toBe("example.com");
  });

  it("rejects non-http schemes, credentials and odd ports", async () => {
    expect(await codeOf(assertSafeUrl("ftp://example.com/x", { lookup: publicLookup }))).toBe(
      "URL_BLOCKED",
    );
    expect(
      await codeOf(assertSafeUrl("https://user:pass@example.com/", { lookup: publicLookup })),
    ).toBe("URL_BLOCKED");
    expect(
      await codeOf(assertSafeUrl("https://example.com:8080/x", { lookup: publicLookup })),
    ).toBe("URL_BLOCKED");
  });

  it("rejects localhost, internal suffixes and IP literals", async () => {
    expect(await codeOf(assertSafeUrl("http://localhost/x", { lookup: publicLookup }))).toBe(
      "URL_BLOCKED",
    );
    expect(await codeOf(assertSafeUrl("http://foo.internal/x", { lookup: publicLookup }))).toBe(
      "URL_BLOCKED",
    );
    expect(await codeOf(assertSafeUrl("http://169.254.169.254/meta", {}))).toBe("URL_BLOCKED");
    expect(await codeOf(assertSafeUrl("http://[::1]/x", {}))).toBe("URL_BLOCKED");
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    expect(await codeOf(assertSafeUrl("https://evil.example/x", { lookup: privateLookup }))).toBe(
      "URL_BLOCKED",
    );
  });
});

describe("safeFetch redirect validation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("re-validates every redirect hop and blocks private targets", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await codeOf(
        safeFetch("https://example.com/start", { maxBytes: 1024, lookup: publicLookup }),
      ),
    ).toBe("URL_BLOCKED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caps oversized responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("x".repeat(64), {
          status: 200,
          headers: { "content-type": "text/html", "content-length": "64" },
        }),
      ),
    );
    expect(
      await codeOf(safeFetch("https://example.com/big", { maxBytes: 16, lookup: publicLookup })),
    ).toBe("URL_FETCH_FAILED");
  });
});
