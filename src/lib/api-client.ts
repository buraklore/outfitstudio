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
import type { Locale } from "@/lib/i18n";
import type { MannequinType, StylePreset } from "@/types/outfit";

/**
 * Client-side error: carries the machine code plus the raw server message.
 * User-facing text is resolved from the code by the UI via i18n.errorMessage,
 * so the same failure renders in whichever language the person chose.
 */
export class ApiClientError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message || code);
    this.name = "ApiClientError";
    this.code = code;
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
  throw new ApiClientError(code, serverMessage);
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
  locale: Locale,
): Promise<AnalyzeResponseDto> {
  return postJson<AnalyzeResponseDto>("/api/clothing/analyze", { images, locale });
}

export function createOutfit(payload: {
  items: OutfitItemInputDto[];
  mannequinType: MannequinType;
  stylePreset?: StylePreset;
  locale: Locale;
}): Promise<CreateOutfitResponseDto> {
  return postJson<CreateOutfitResponseDto>("/api/outfits", payload);
}

export function generateOutfit(id: string): Promise<GenerateResponseDto> {
  return postJson<GenerateResponseDto>(`/api/outfits/${id}/generate`, {});
}

export function requestOutfitAnalysis(id: string): Promise<OutfitAnalysisDto> {
  return postJson<OutfitAnalysisDto>(`/api/outfits/${id}/analyze`, {});
}
