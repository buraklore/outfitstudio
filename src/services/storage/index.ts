import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * Storage abstraction (spec §3): a `local` disk driver for development and an
 * `s3` driver for any S3-compatible provider (AWS S3, Cloudflare R2, MinIO).
 * Both are addressed by the same opaque keys; images are served either from
 * STORAGE_PUBLIC_URL or proxied through /api/files/[...path].
 */

export interface StoredObject {
  key: string;
  url: string;
}

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<{ body: Buffer; contentType: string }>;
  publicUrl(key: string): string;
}

const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;

export function assertValidKey(key: string): void {
  if (!KEY_RE.test(key) || key.includes("..") || key.length > 240) {
    throw new AppError("INVALID_INPUT", "Invalid storage key.");
  }
}

export function newImageKey(prefix: string, ext = "jpg"): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${prefix}/${yyyy}/${mm}/${randomUUID()}.${ext}`;
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export function contentTypeForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export function extensionForContentType(contentType: string): string {
  const entry = Object.entries(CONTENT_TYPES).find(([, mime]) => mime === contentType);
  return entry?.[0] ?? "bin";
}

class LocalStorageDriver implements StorageDriver {
  private readonly root = path.join(process.cwd(), "storage");

  private resolve(key: string): string {
    assertValidKey(key);
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(path.resolve(this.root) + path.sep)) {
      throw new AppError("INVALID_INPUT", "Invalid storage key.");
    }
    return resolved;
  }

  async put(key: string, body: Buffer, _contentType: string): Promise<StoredObject> {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, body);
    return { key, url: this.publicUrl(key) };
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string }> {
    const filePath = this.resolve(key);
    try {
      const body = await fs.readFile(filePath);
      return { body, contentType: contentTypeForKey(key) };
    } catch {
      throw new AppError("NOT_FOUND", "File not found.");
    }
  }

  publicUrl(key: string): string {
    return `/api/files/${key}`;
  }
}

class S3StorageDriver implements StorageDriver {
  private client: S3Client | null = null;
  private readonly bucket: string;
  private readonly publicBase: string | null;

  constructor() {
    const env = getEnv();
    if (!env.STORAGE_BUCKET) {
      throw new AppError("INTERNAL", "STORAGE_DRIVER=s3 requires STORAGE_BUCKET.", {
        status: 500,
      });
    }
    this.bucket = env.STORAGE_BUCKET;
    this.publicBase = env.STORAGE_PUBLIC_URL ? env.STORAGE_PUBLIC_URL.replace(/\/$/, "") : null;
  }

  private getClient(): S3Client {
    if (this.client) return this.client;
    const env = getEnv();
    this.client = new S3Client({
      region: env.STORAGE_REGION || "auto",
      ...(env.STORAGE_URL ? { endpoint: env.STORAGE_URL, forcePathStyle: true } : {}),
      ...(env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY
        ? {
            credentials: {
              accessKeyId: env.STORAGE_ACCESS_KEY,
              secretAccessKey: env.STORAGE_SECRET_KEY,
            },
          }
        : {}),
    });
    return this.client;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    assertValidKey(key);
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { key, url: this.publicUrl(key) };
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string }> {
    assertValidKey(key);
    try {
      const res = await this.getClient().send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) throw new Error("empty body");
      return {
        body: Buffer.from(bytes),
        contentType: res.ContentType ?? contentTypeForKey(key),
      };
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("NOT_FOUND", "File not found.", { cause: e });
    }
  }

  publicUrl(key: string): string {
    return this.publicBase ? `${this.publicBase}/${key}` : `/api/files/${key}`;
  }
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  driver = getEnv().STORAGE_DRIVER === "s3" ? new S3StorageDriver() : new LocalStorageDriver();
  return driver;
}
