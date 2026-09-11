import type {
  AnalyzeResponseDto,
  ApiResponse,
  CreateOutfitResponseDto,
  ExtractedProductDto,
  GenerateResponseDto,
  OutfitAnalysisDto,
  OutfitItemInputDto,
  UploadedImageDto,
} from "@/types/api";
import type { MannequinType, StylePreset } from "@/types/outfit";

/** Client-side error carrying the machine code + the §22 user-facing message. */
export class ApiClientError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
  }
}

/**
 * Spec §22 — exact client-facing copy for the three canonical failures, plus
 * gentle fallbacks for rate limits and AI availability.
 */
export function friendlyMessage(code: string, serverMessage?: string): string {
  switch (code) {
    case "URL_BLOCKED":
    case "URL_FETCH_FAILED":
    case "PRODUCT_IMAGE_NOT_FOUND":
      return "We couldn't access this product page. Please upload the product image instead.";
    case "CLOTHING_NOT_DETECTED":
    case "IMAGE_UNREADABLE":
      return "We couldn't identify this clothing item. Please upload a clearer image.";
    case "GENERATION_FAILED":
      return "The outfit preview couldn't be generated. Please try again.";
    case "RATE_LIMITED":
    case "AI_RATE_LIMITED":
      return "Too many requests right now — please wait a moment and try again.";
    case "AI_UNAVAILABLE":
      return "The AI service is unavailable right now. Please try again shortly.";
    default:
      return serverMessage || "Something went wrong. Please try again.";
  }
}

async function handle<T>(res: Response): Promise<T> {
  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }
  if (payload && payload.ok) return payload.data;
  const code =
    payload && !payload.ok
      ? payload.error.code
      : res.status === 429
        ? "RATE_LIMITED"
        : "INTERNAL";
  const serverMessage = payload && !payload.ok ? payload.error.message : undefined;
  throw new ApiClientError(code, friendlyMessage(code, serverMessage));
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return handle<T>(res);
}

export async function uploadImage(file: File): Promise<UploadedImageDto> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: form });
  return handle<UploadedImageDto>(res);
}

export function extractProduct(url: string): Promise<ExtractedProductDto> {
  return postJson<ExtractedProductDto>("/api/products/extract", { url });
}

export function analyzeClothing(
  images: { imageKey: string; slotHint?: string }[],
): Promise<AnalyzeResponseDto> {
  return postJson<AnalyzeResponseDto>("/api/clothing/analyze", { images });
}

export function createOutfit(payload: {
  items: OutfitItemInputDto[];
  mannequinType: MannequinType;
  stylePreset?: StylePreset;
}): Promise<CreateOutfitResponseDto> {
  return postJson<CreateOutfitResponseDto>("/api/outfits", payload);
}

export function generateOutfit(id: string): Promise<GenerateResponseDto> {
  return postJson<GenerateResponseDto>(`/api/outfits/${id}/generate`, {});
}

export function requestOutfitAnalysis(id: string): Promise<OutfitAnalysisDto> {
  return postJson<OutfitAnalysisDto>(`/api/outfits/${id}/analyze`, {});
}
