import type { ClothingCategory, OutfitSlot } from "@/types/clothing";
import type { MannequinType, StylePreset } from "@/types/outfit";

/**
 * Full TR/EN dictionary. Turkish is the product default; English is available
 * via the header switcher. The locale chosen at creation time is stored on the
 * Outfit and drives both the AI output language and the result page language.
 */

export const LOCALES = ["tr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "tr";
export const LOCALE_COOKIE = "os_locale";

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "tr";
}

const CATEGORY_TR: Record<ClothingCategory, string> = {
  shirt: "gömlek",
  tshirt: "tişört",
  polo: "polo yaka",
  sweatshirt: "sweatshirt",
  hoodie: "kapüşonlu",
  jacket: "ceket",
  coat: "kaban",
  blazer: "blazer",
  pants: "pantolon",
  jeans: "kot pantolon",
  shorts: "şort",
  skirt: "etek",
  dress: "elbise",
  sneakers: "spor ayakkabı",
  boots: "bot",
  loafers: "loafer",
  heels: "topuklu ayakkabı",
  sandals: "sandalet",
  bag: "çanta",
  belt: "kemer",
  hat: "şapka",
  watch: "saat",
  glasses: "gözlük",
  accessory: "aksesuar",
};

const SLOT_TR: Record<OutfitSlot, string> = {
  top: "Üst giyim",
  bottom: "Alt giyim",
  full: "Tek parça",
  outerwear: "Dış giyim",
  shoes: "Ayakkabı",
  accessory: "Aksesuar",
};

const SLOT_EN: Record<OutfitSlot, string> = {
  top: "Top",
  bottom: "Bottom",
  full: "Full outfit",
  outerwear: "Outerwear",
  shoes: "Shoes",
  accessory: "Accessory",
};

const SCORE_LABEL_TR: Record<string, string> = {
  Outstanding: "Olağanüstü",
  Excellent: "Mükemmel",
  Good: "İyi",
  Fair: "Orta",
  "Needs work": "Geliştirilmeli",
};

const CRITERION_TR: Record<string, string> = {
  colorHarmony: "Renk uyumu",
  styleConsistency: "Stil tutarlılığı",
  fitAndProportion: "Kalıp & oran",
  itemCompatibility: "Parça uyumu",
  occasionSuitability: "Ortama uygunluk",
  visualBalance: "Görsel denge",
  fashionImpact: "Trend & moda etkisi",
  versatility: "Çok yönlülük",
};

const CRITERION_EN: Record<string, string> = {
  colorHarmony: "Color harmony",
  styleConsistency: "Style consistency",
  fitAndProportion: "Fit & proportion",
  itemCompatibility: "Item compatibility",
  occasionSuitability: "Occasion suitability",
  visualBalance: "Visual balance",
  fashionImpact: "Trend & fashion impact",
  versatility: "Versatility",
};

export function categoryLabel(locale: Locale, category: string): string {
  if (locale === "tr") return CATEGORY_TR[category as ClothingCategory] ?? category;
  return category.replace(/-/g, " ");
}

export function slotLabel(locale: Locale, slot: OutfitSlot | string): string {
  const map = locale === "tr" ? SLOT_TR : SLOT_EN;
  return map[slot as OutfitSlot] ?? String(slot);
}

export function scoreLabelText(locale: Locale, englishLabel: string): string {
  if (locale === "tr") return SCORE_LABEL_TR[englishLabel] ?? englishLabel;
  return englishLabel;
}

export function criterionLabel(locale: Locale, key: string, fallback: string): string {
  const map = locale === "tr" ? CRITERION_TR : CRITERION_EN;
  return map[key] ?? fallback;
}

/** Spec §22 messages plus friendly fallbacks, per locale. */
export function errorMessage(locale: Locale, code: string, serverMessage?: string): string {
  const tr: Record<string, string> = {
    URL_BLOCKED: "Bu ürün sayfasına erişemedik. Lütfen bunun yerine ürün görselini yükleyin.",
    URL_FETCH_FAILED: "Bu ürün sayfasına erişemedik. Lütfen bunun yerine ürün görselini yükleyin.",
    PRODUCT_IMAGE_NOT_FOUND:
      "Bu ürün sayfasına erişemedik. Lütfen bunun yerine ürün görselini yükleyin.",
    CLOTHING_NOT_DETECTED: "Bu kıyafeti tanıyamadık. Lütfen daha net bir görsel yükleyin.",
    IMAGE_UNREADABLE: "Bu kıyafeti tanıyamadık. Lütfen daha net bir görsel yükleyin.",
    GENERATION_FAILED: "Kombin önizlemesi oluşturulamadı. Lütfen tekrar deneyin.",
    RATE_LIMITED: "Şu anda çok fazla istek var — lütfen kısa bir süre bekleyip tekrar deneyin.",
    AI_RATE_LIMITED: "Şu anda çok fazla istek var — lütfen kısa bir süre bekleyip tekrar deneyin.",
    AI_UNAVAILABLE: "Yapay zekâ hizmeti şu anda kullanılamıyor. Lütfen kısa süre sonra tekrar deneyin.",
    IMAGE_TOO_LARGE: "Görsel 10 MB'tan küçük olmalı.",
    UNSUPPORTED_FILE: "Yalnızca JPEG, PNG, WEBP ve AVIF görseller destekleniyor.",
    default: "Bir şeyler ters gitti. Lütfen tekrar deneyin.",
  };
  const en: Record<string, string> = {
    URL_BLOCKED: "We couldn't access this product page. Please upload the product image instead.",
    URL_FETCH_FAILED:
      "We couldn't access this product page. Please upload the product image instead.",
    PRODUCT_IMAGE_NOT_FOUND:
      "We couldn't access this product page. Please upload the product image instead.",
    CLOTHING_NOT_DETECTED: "We couldn't identify this clothing item. Please upload a clearer image.",
    IMAGE_UNREADABLE: "We couldn't identify this clothing item. Please upload a clearer image.",
    GENERATION_FAILED: "The outfit preview couldn't be generated. Please try again.",
    RATE_LIMITED: "Too many requests right now — please wait a moment and try again.",
    AI_RATE_LIMITED: "Too many requests right now — please wait a moment and try again.",
    AI_UNAVAILABLE: "The AI service is unavailable right now. Please try again shortly.",
    IMAGE_TOO_LARGE: "Images must be 10 MB or smaller.",
    UNSUPPORTED_FILE: "Only JPEG, PNG, WEBP and AVIF images are supported.",
    default: "Something went wrong. Please try again.",
  };
  const map = locale === "tr" ? tr : en;
  return map[code] ?? serverMessage ?? map.default;
}

/** buildOutfit warning codes → localized text. */
export function warningText(locale: Locale, code: string): string {
  const tr: Record<string, string> = {
    "missing-top": "Üst giyim seçilmedi.",
    "missing-bottom": "Alt giyim seçilmedi.",
    "missing-shoes": "Ayakkabı seçilmedi.",
    "max-items": "Yalnızca ilk 10 parça mankende gösterilebilir.",
  };
  const en: Record<string, string> = {
    "missing-top": "No top selected.",
    "missing-bottom": "No bottom selected.",
    "missing-shoes": "No shoes selected.",
    "max-items": "Only the first 10 items can be rendered.",
  };
  return (locale === "tr" ? tr : en)[code] ?? code;
}

export const MESSAGES = {
  tr: {
    metaDescription:
      "Kıyafet linkleri ekleyin veya kıyafetlerinizi yükleyin. Kombini sizin için biz oluşturalım.",
    header: { nav: "Kombin oluştur" },
    footer: "Kombin önizlemeleri yapay zekâ görselleştirmesidir; gerçek ürün fotoğrafı değildir.",
    landing: {
      eyebrow: "Yapay zekâ ile kombin ve stil analizi",
      title: "Kombinini Oluştur",
      subtitle1: "Kıyafet linkleri ekle veya kıyafetlerini yükle.",
      subtitle2: "Kombini senin için biz oluşturalım.",
      card1Title: "Ürün Linki Ekle",
      card1Desc:
        "Üst, alt, ayakkabı ve daha fazlası için URL yapıştır — ürün görsellerini biz çekelim.",
      card1Cta: "Linklerle başla",
      card2Title: "Kıyafet Fotoğrafı Yükle",
      card2Desc: "Fotoğraf çek veya yükle — tek fotoğrafta birden fazla parça da olur.",
      card2Cta: "Fotoğraflarla başla",
      steps: [
        { title: "Parçalarını ekle", text: "Ürün linki yapıştır ya da kıyafet fotoğrafı yükle." },
        { title: "Mankeni biz giydirelim", text: "Yapay zekâ, senin parçalarını tek bir kombin önizlemesinde birleştirir." },
        { title: "Skorunu al", text: "0–100 puan ve gerekçeli, ayrıntılı bir stil raporu." },
      ],
      honestyTitle: "Tasarımı gereği dürüst.",
      honestyText:
        "Orijinal ürün fotoğrafların hiç değiştirilmez; manken görseli açıkça yapay zekâ önizlemesi olarak etiketlenir ve her parçanın rengini, desenini ve kesimini korumayı hedefler.",
    },
    create: {
      eyebrow: "Kombinini oluştur",
      titleAdd: "Parçalarını ekle",
      titleReview: "Parçalarını gözden geçir",
      subAdd: "Kıyafet linkleri ekle veya kıyafetlerini yükle. Kombini senin için biz oluşturalım.",
      subReview: "Algıladıklarımızı onayla, bir manken seç ve kombinini oluştur.",
      tabLinks: "Ürün linkleri",
      tabUpload: "Fotoğraf yükle",
      slotTop: "Üst Giyim",
      slotBottom: "Alt Giyim",
      slotShoes: "Ayakkabı",
      slotOuterwear: "Ceket / Dış Giyim",
      slotAccessory: "Aksesuar",
      slotExtra: "Parça",
      optional: "isteğe bağlı",
      urlPlaceholder: "https://magaza.com/urun…",
      uploadInstead: "Bunun yerine ürün görselini yükle",
      uploading: "Yükleniyor…",
      ready: "Hazır",
      remove: "Kaldır",
      uploadedImage: "Yüklenen görsel",
      addAnother: "+ Başka parça ekle",
      analyzeBtn: "Parçalarımı analiz et",
      minTwo: "Kombin için en az iki parça ekle (örneğin bir üst ve bir alt).",
      minOneUpload: "En az bir kıyafet fotoğrafı yükle.",
      someFailed:
        "Bazı ürün sayfalarına erişilemedi. Aşağıdan görsellerini yükle ya da o linkleri kaldır.",
      dropTitle: "Fotoğrafları buraya bırak ya da seçmek için dokun",
      dropSub: "JPEG, PNG, WebP veya AVIF · her biri en fazla 10 MB · tek fotoğrafta birden çok parça olabilir",
      stepCollect: "Ürün görselleri toplanıyor",
      stepAnalyze: "Kıyafetler analiz ediliyor",
      stepPlan: "Kombin planlanıyor",
      stepPreview: "Manken önizlemesi oluşturuluyor",
      stepScore: "Puanlanıyor ve stil raporu hazırlanıyor",
      originalProduct: "Orijinal ürün",
      yourPhoto: "Senin fotoğrafın",
      categoryAria: "Kıyafet kategorisi",
      confirmAsk: (desc: string) => `Bunun ${desc} olduğunu düşünüyoruz. Doğru mu?`,
      correct: "Doğru",
      changeCategory: "Kategoriyi değiştir",
      mannequin: "Manken",
      preset: "Stil ön ayarı",
      presetNote:
        "Ön ayarlar yalnızca mankenin duruşunu ve arka plan atmosferini yönlendirir; kıyafetlerin asla değiştirilmez.",
      generate: "Kombini Oluştur",
      confirmPending: (n: number) => `Önce işaretli ${n} parçayı onayla.`,
      keepTwo: "Kombin için en az iki parça kalmalı.",
      back: "← Geri",
      skipped: "Atlananlar",
      buildingHonesty: "Önizleme yapay zekâ üretimidir — orijinal ürün fotoğrafları her zaman olduğu gibi kalır.",
      dupTitle: "Aynı bölmede birden fazla parça var:",
      dupBottom: (n: number) => `${n} alt giyim`,
      dupShoes: (n: number) => `${n} ayakkabı`,
      dupNote: "Manken doğal şekilde katmanlayamadıklarını giymez; istemediklerini kaldırman önerilir.",
    },
    result: {
      yourOutfit: "Kombinin",
      breakdown: "Puan dağılımı",
      whyItWorks: "Neden işe yarıyor",
      improve: "Nasıl geliştirilir",
      bestFor: "En uygun olduğu ortamlar",
      suggested: "Önerilen kombin",
      originalProducts: "Orijinal ürünler",
      originalCaption:
        "Bunlar dokunulmamış kaynak görsellerin — yukarıdaki önizleme onların yapay zekâ görselleştirmesidir.",
      aiPreview: "Yapay Zekâ Kombin Önizlemesi",
      notReal: "Görselleştirme — gerçek fotoğraf değil",
      viewProduct: "Ürünü gör →",
      buildAnother: "Yeni kombin oluştur",
      startOver: "← Baştan başla",
      previewFailed: "Kombin önizlemesi oluşturulamadı. Lütfen tekrar deneyin.",
      previewPreparing: "Önizleme hâlâ hazırlanıyor.",
      scoreNote: "Önizleme oluşturulduğunda skorun ve stil raporun burada görünecek.",
      analyzePendingText: "Kombin önizlemen hazır ama stil raporu henüz oluşturulmadı.",
      analyzeBtn: "Bu kombini puanla",
      analyzeBusy: "Kombinin puanlanıyor…",
    },
    switcher: { tr: "TR", en: "EN", aria: "Dil seçimi" },
  },
  en: {
    metaDescription:
      "Add clothing links or upload your clothes. We'll create the outfit for you.",
    header: { nav: "Build an outfit" },
    footer: "Outfit previews are AI-generated visualizations, not real product photos.",
    landing: {
      eyebrow: "AI outfit builder & style analysis",
      title: "Build Your Outfit",
      subtitle1: "Add clothing links or upload your clothes.",
      subtitle2: "We'll create the outfit for you.",
      card1Title: "Add Product Links",
      card1Desc:
        "Paste URLs for a top, bottom, shoes and more — we'll pull the product images.",
      card1Cta: "Start with links",
      card2Title: "Upload Clothing Photos",
      card2Desc: "Snap or upload photos — several garments in one photo work too.",
      card2Cta: "Start with photos",
      steps: [
        { title: "Add your pieces", text: "Paste product links or upload photos of your clothes." },
        { title: "We dress the mannequin", text: "AI combines your exact items into one outfit preview." },
        { title: "Get your score", text: "A 0–100 score with a detailed, explainable style report." },
      ],
      honestyTitle: "Honest by design.",
      honestyText:
        "Your original product photos stay untouched; the mannequin image is clearly labeled as an AI preview and aims to preserve every garment's colors, patterns and cut.",
    },
    create: {
      eyebrow: "Build your outfit",
      titleAdd: "Add your pieces",
      titleReview: "Review your items",
      subAdd: "Add clothing links or upload your clothes. We'll create the outfit for you.",
      subReview: "Confirm what we detected, pick a mannequin, then generate your outfit.",
      tabLinks: "Product links",
      tabUpload: "Upload photos",
      slotTop: "Top",
      slotBottom: "Bottom",
      slotShoes: "Shoes",
      slotOuterwear: "Jacket / Outerwear",
      slotAccessory: "Accessory",
      slotExtra: "Item",
      optional: "optional",
      urlPlaceholder: "https://store.com/product…",
      uploadInstead: "Upload the product image instead",
      uploading: "Uploading…",
      ready: "Ready",
      remove: "Remove",
      uploadedImage: "Uploaded image",
      addAnother: "+ Add another item",
      analyzeBtn: "Analyze my items",
      minTwo: "Add at least two items (e.g. a top and a bottom) to build an outfit.",
      minOneUpload: "Upload at least one photo of your clothes.",
      someFailed:
        "Some product pages couldn't be accessed. Upload their images below, or remove those links.",
      dropTitle: "Drop photos here or tap to choose",
      dropSub: "JPEG, PNG, WebP or AVIF · up to 10 MB each · several garments in one photo are fine",
      stepCollect: "Collecting product images",
      stepAnalyze: "Analyzing clothing items",
      stepPlan: "Planning the outfit",
      stepPreview: "Creating the mannequin preview",
      stepScore: "Scoring & preparing your style report",
      originalProduct: "Original product",
      yourPhoto: "Your photo",
      categoryAria: "Clothing category",
      confirmAsk: (desc: string) => `We think this is a ${desc}. Is that right?`,
      correct: "Correct",
      changeCategory: "Change category",
      mannequin: "Mannequin",
      preset: "Style preset",
      presetNote:
        "Presets guide the mannequin's pose & backdrop mood only — your garments are never altered.",
      generate: "Generate Outfit",
      confirmPending: (n: number) => `Confirm ${n} highlighted item${n > 1 ? "s" : ""} first.`,
      keepTwo: "Keep at least two items to build an outfit.",
      back: "← Back",
      skipped: "Skipped",
      buildingHonesty: "The preview is AI-generated — original product photos always stay untouched.",
      dupTitle: "Multiple items share the same slot:",
      dupBottom: (n: number) => `${n} bottoms`,
      dupShoes: (n: number) => `${n} pairs of shoes`,
      dupNote: "The mannequin won't wear items it can't layer naturally; consider removing extras.",
    },
    result: {
      yourOutfit: "Your outfit",
      breakdown: "Score breakdown",
      whyItWorks: "Why it works",
      improve: "How to improve",
      bestFor: "Best for",
      suggested: "Suggested outfit",
      originalProducts: "Original products",
      originalCaption:
        "These are your untouched source images — the preview above is an AI visualization of them.",
      aiPreview: "AI Outfit Preview",
      notReal: "Visualization — not a real photo",
      viewProduct: "View product →",
      buildAnother: "Build another outfit",
      startOver: "← Start over",
      previewFailed: "The outfit preview couldn't be generated. Please try again.",
      previewPreparing: "The preview is still being prepared.",
      scoreNote: "Once the preview is generated, your score and style report will appear here.",
      analyzePendingText: "Your outfit preview is ready, but the style report hasn't been generated yet.",
      analyzeBtn: "Score this outfit",
      analyzeBusy: "Scoring your outfit…",
    },
    switcher: { tr: "TR", en: "EN", aria: "Language" },
  },
} as const;

export type Messages = (typeof MESSAGES)["en"];

export function t(locale: Locale): Messages {
  return MESSAGES[locale] as Messages;
}

export function mannequinLabel(locale: Locale, type: MannequinType): string {
  const tr: Record<MannequinType, string> = {
    NEUTRAL: "Nötr manken",
    MALE: "Erkek manken",
    FEMALE: "Kadın manken",
  };
  const en: Record<MannequinType, string> = {
    NEUTRAL: "Neutral mannequin",
    MALE: "Male mannequin",
    FEMALE: "Female mannequin",
  };
  return (locale === "tr" ? tr : en)[type];
}

export function presetLabel(locale: Locale, preset: StylePreset): string {
  const tr: Record<StylePreset, string> = {
    auto: "Otomatik",
    minimal: "Minimal",
    "smart-casual": "Şık günlük",
    streetwear: "Sokak stili",
  };
  const en: Record<StylePreset, string> = {
    auto: "Auto",
    minimal: "Minimal",
    "smart-casual": "Smart casual",
    streetwear: "Streetwear",
  };
  return (locale === "tr" ? tr : en)[preset];
}
