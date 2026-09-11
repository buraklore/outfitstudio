import { ZodError } from "zod";

/**
 * Application-level error codes. The HTTP status and the user-facing message
 * (src/lib/api-client.ts) are both derived from the code, so services can
 * throw AppError without knowing anything about HTTP or the UI.
 */
export type ErrorCode =
  | "INVALID_INPUT"
  | "URL_BLOCKED"
  | "URL_FETCH_FAILED"
  | "PRODUCT_IMAGE_NOT_FOUND"
  | "UNSUPPORTED_FILE"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_UNREADABLE"
  | "CLOTHING_NOT_DETECTED"
  | "AI_PARSE_FAILED"
  | "AI_RATE_LIMITED"
  | "AI_UNAVAILABLE"
  | "GENERATION_FAILED"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL";

const STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  URL_BLOCKED: 400,
  URL_FETCH_FAILED: 422,
  PRODUCT_IMAGE_NOT_FOUND: 422,
  UNSUPPORTED_FILE: 415,
  IMAGE_TOO_LARGE: 413,
  IMAGE_UNREADABLE: 422,
  CLOTHING_NOT_DETECTED: 422,
  AI_PARSE_FAILED: 502,
  AI_RATE_LIMITED: 429,
  AI_UNAVAILABLE: 503,
  GENERATION_FAILED: 502,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  INVALID_INPUT: "The request payload is invalid.",
  URL_BLOCKED: "This URL is not allowed.",
  URL_FETCH_FAILED: "The product page could not be fetched.",
  PRODUCT_IMAGE_NOT_FOUND: "No usable product image was found on the page.",
  UNSUPPORTED_FILE: "This file type is not supported.",
  IMAGE_TOO_LARGE: "The image exceeds the maximum allowed size.",
  IMAGE_UNREADABLE: "The image could not be read.",
  CLOTHING_NOT_DETECTED: "No clothing item could be identified in the image.",
  AI_PARSE_FAILED: "The AI response could not be parsed.",
  AI_RATE_LIMITED: "The AI service is rate limited right now.",
  AI_UNAVAILABLE: "The AI service is unavailable.",
  GENERATION_FAILED: "The outfit preview could not be generated.",
  NOT_FOUND: "Resource not found.",
  RATE_LIMITED: "Too many requests. Please slow down.",
  INTERNAL: "Something went wrong.",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: ErrorCode,
    message?: string,
    opts?: { status?: number; details?: unknown; cause?: unknown },
  ) {
    super(message ?? DEFAULT_MESSAGES[code], { cause: opts?.cause });
    this.name = "AppError";
    this.code = code;
    this.status = opts?.status ?? STATUS[code];
    this.details = opts?.details;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

export function httpStatusFor(code: ErrorCode): number {
  return STATUS[code];
}

/** Converts any thrown value into an AppError without leaking internals. */
export function normalizeError(e: unknown): AppError {
  if (isAppError(e)) return e;
  if (e instanceof ZodError) {
    const first = e.issues[0];
    const where = first?.path?.length ? ` (${first.path.join(".")})` : "";
    return new AppError("INVALID_INPUT", `${first?.message ?? "Invalid input"}${where}`, {
      details: e.issues,
      cause: e,
    });
  }
  if (e instanceof Error) {
    return new AppError("INTERNAL", DEFAULT_MESSAGES.INTERNAL, { cause: e });
  }
  return new AppError("INTERNAL");
}
