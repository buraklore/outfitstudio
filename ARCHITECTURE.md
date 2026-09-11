# Outfit Studio — Mimari (10 Başlık)

## 1) Klasör yapısı

```
prisma/schema.prisma          # veri modeli
src/
  app/                        # App Router
    page.tsx                  # landing (§18 metinleri)
    create/page.tsx           # akış sarmalayıcı (Suspense)
    outfits/[id]/page.tsx     # sonuç sayfası (server component)
    api/
      uploads/                # POST foto yükleme
      products/extract/       # POST URL → ürün görseli+metadata
      clothing/analyze/       # POST Gemini Vision kıyafet analizi
      outfits/                # POST outfit oluştur
      outfits/[id]/           # GET durum+rapor
      outfits/[id]/generate/  # POST manken önizleme üretimi
      outfits/[id]/analyze/   # POST puanlama + stil raporu
      files/[...path]/        # GET yerel depodan görsel servisi
  components/                 # ui.tsx, StepList, create/CreateFlow
  lib/                        # env, errors, http, auth, cache, validation, security/ssrf
  services/
    gemini/                   # Interactions API istemcisi + structured parse
    product-extraction/       # html-parser (saf) + orkestrasyon
    clothing-analysis/        # vision şema + normalize + cache
    outfit-generation/        # prompt builder + görsel üretim
    outfit-analysis/          # rubrik, puan hesabı, rapor
    image-processing/         # sharp normalize / AI input boyutlama
    storage/                  # local & S3 sürücüleri
  types/                      # clothing (24 kategori), outfit, api DTO'ları
tests/                        # 7 dosya, 35 birim testi
scripts/smoke-gemini.mjs      # manuel canlı API testi
```

Kural: UI kodunda AI çağrısı yok; her AI teması `services/` altında, model adları env'den.

## 2) Veritabanı şeması (Prisma)

`User` (anonim cookie kimliği) → `Outfit` (status: DRAFT→GENERATING→GENERATED→ANALYZING→ANALYZED / FAILED + failureCode, mannequinType, stylePreset, generatedImageKey/Url, overallScore) → `OutfitItem` (slot: top/full/bottom/outerwear/shoes/accessory, position, unique(outfitId,clothingItemId)) → `ClothingItem` (source URL|UPLOAD, imageKey, 24-kategori + renk/desen/materyal/fit/stil/sezon/formalite/confidence, metadata Json) → opsiyonel `ProductSource` (domain, title, brand, price/currency, extractionMethod, confidence, raw Json). `GeneratedImage` üretim geçmişi (prompt sürümlü, model adlı); `OutfitAnalysis` (1-1, breakdown/improvements Json, bestFor[], detectedStyles[], model+promptVersion); `AnalysisCache` (cacheKey sha256, expiresAt) — URL ve görsel-hash önbelleği.

## 3) API uçları

| Uç | Görev | Süre limiti | Rate limit |
| --- | --- | --- | --- |
| POST /api/uploads | foto normalize + depola | 30s | 30/dk |
| POST /api/products/extract | URL→görsel+metadata | 60s | 20/dk |
| POST /api/clothing/analyze | Vision analiz (çoklu görsel) | 120s | 20/dk |
| POST /api/outfits | outfit + item kalıcılaştır | 30s | 20/dk |
| POST /api/outfits/:id/generate | manken önizleme | 300s | 6/dk |
| POST /api/outfits/:id/analyze | puan + rapor | 180s | 10/dk |
| GET /api/outfits/:id | tam durum DTO'su | — | — |
| GET /api/files/* | görsel servisi (immutable cache) | — | — |

Tümü `{ ok: true, data } | { ok: false, error: { code, message } }` zarfı döner; istemci §22 metin eşlemesini `api-client.friendlyMessage` ile yapar.

## 4) URL → ürün çıkarım hattı

`assertSafeUrl` (şema/port/credential/hostname + DNS private-IP kontrolü) → `safeFetch` (manuel redirect ≤4, her adımda yeniden doğrulama, 12s timeout, bayt tavanı) → içerik direkt görselse indir; HTML ise `parseProductHtml`: **JSON-LD** (Product/@graph/offers/ImageObject) → **OpenGraph/twitter** → **heuristik `<img>`** (sprite/logo/küçük eleme). Aday görseller sırayla indirilir, sharp ile doğrulanır, normalize edilip depolanır; `ProductSource` yazılır; 24h cache. Görsel bulunamazsa `PRODUCT_IMAGE_NOT_FOUND` → istemcide §22 "upload instead" akışı. Bot koruması aşılmaz — dürüst tek fetch.

## 5) Görsel analiz hattı

Yükleme/çıkarımdan gelen normalize görsel → 768px AI kopyası → Gemini Vision (`gemini-3.8-flash`) yapılandırılmış JSON şemasıyla: fotoğraftaki **her** giysi ayrı öğe, insan fotoğrafında yalnız giysiler, materyal ifadesi temkinli, dürüst confidence. Yanıt zod ile esnek parse edilir (`.catch` varsayılanları), kategori 24'lük taksonomiye normalize edilir (eş anlamlı haritası; eşleşmeyen → accessory + confidence ≤0.4 + `categoryMatched:false` → UI'da onay kartı §29). Sonuç sha256(görsel)+model+prompt sürümü anahtarıyla 7 gün cache'lenir.

## 6) Outfit üretim hattı

`buildOutfit` öğeleri slotlara dizer (SLOT_ORDER; top/bottom/shoes eksikse uyarı, engel değil) → `generateMannequinImage`: tüm öğe görselleri referans girdi (≤10) + sürümlü prompt — sahne (mat açık gri cansız manken, yüzsüz, tam boy ön, kırık beyaz stüdyo, 3:4) + öğe listesi ("Input image N — SLOT (category): description") + **KATI KORUMA KURALLARI** (renk/desen/logo/kesim/ayakkabı aynen; benzer ürün uydurma yok; görünmeyen alan sade). `gemini-3.1-flash-image`, `aspect_ratio:"3:4"`. Çıktı depolanır, `GeneratedImage` kaydı + status GENERATED tek transaction'da.

## 7) Puanlama sistemi

Sabit rubrik (Renk Uyumu 20 · Stil Tutarlılığı 20 · Fit&Oran 15 · Parça Uyumluluğu 15 · Duruma Uygunluk 10 · Görsel Denge 10 · Trend 5 · Çok Yönlülük 5). Model, önizleme **ve** orijinal ürün fotoğraflarını görür ("çelişkide orijinale güven" talimatıyla), kriter başına puan+gerekçe döner; **toplamı asla model hesaplamaz** — `calculateOutfitScore` kriterleri [0,max] aralığına kırpar, 1 ondalığa yuvarlar, 0–100 toplamı sunucuda üretir. Etiketler: ≥90 Outstanding · ≥80 Excellent · ≥70 Good · ≥55 Fair · altı Needs work. Tutarlılık: seed=7 + sabit prompt sürümü (Interactions API'de temperature yok). Rapor dili `ANALYSIS_LOCALE` (tr varsayılan), UI İngilizce.

## 8) Hata yönetimi

Tek `AppError(code)` modeli; kod→HTTP eşlemesi merkezî. `normalizeError` Zod/bilinmeyen hataları sarar, iç detay sızdırmaz. Durum makinesi dürüst: generate hatası → FAILED+failureCode; analiz hatası → GENERATED'a döner (önizleme korunur, sonuç sayfasında "Score this outfit" retry butonu). İstemci §22 metinleri birebir: erişilemeyen sayfa → "We couldn't access this product page. Please upload the product image instead."; tanınamayan giysi → "We couldn't identify this clothing item. Please upload a clearer image."; üretim hatası → "The outfit preview couldn't be generated. Please try again."

## 9) Güvenlik

SSRF (bkz. §4) + anahtarlar yalnız sunucuda (env.ts lazy zod doğrulama) + cookie httpOnly anonim kimlik ve her kaynakta sahiplik kontrolü (yabancı outfit → 404, varlık sızdırmaz) + sabit-pencere rate limit (uç başına) + upload doğrulama (mime allow-list, 10MB, min 200px, sharp ile yeniden kodlama — polyglot dosyaları etkisizleştirir) + imageKey regex/`..`/prefix doğrulaması ve yerel sürücüde path-escape koruması + `/api/files` immutable + nosniff. Bilinen artık risk: DNS-rebinding (çözümleme-fetch aralığı) — ssrf.ts'te belgeli.

## 10) Önbellekleme

`AnalysisCache` (Postgres, sha256 anahtar, TTL): ürün çıkarımı `product-extract|v1|url` 24h; kıyafet analizi `clothing-analysis|v1|model|sha256(görsel)|slotHint` 7g. Cache hataları yutulur (best-effort). Üretilen görseller içerik-adresli anahtarlarla depoda, HTTP tarafında 1 yıl immutable. Prompt'lar sürümlü (`v1`) — prompt değişince cache doğal olarak ayrışır.
