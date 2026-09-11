# Outfit Studio

AI outfit builder & style analysis platform. Users add clothing via product URLs or photo uploads; the app renders all items on a lifeless retail mannequin (Gemini image generation), then scores the outfit 0–100 against a fixed rubric with an explainable style report.

## Stack

- **Next.js 16** (App Router, TypeScript strict) · **Tailwind v4**
- **Prisma 6 + PostgreSQL**
- **Gemini Interactions API** via `@google/genai` — text/vision: `gemini-3.8-flash`, image: `gemini-3.1-flash-image` (both overridable via env)
- **sharp** (image normalization) · **cheerio** (product page parsing) · **zod v4** · **vitest**

## Setup

```bash
npm install
docker compose up -d                 # local PostgreSQL 16
cp .env.example .env                 # then set GEMINI_API_KEY
npx prisma migrate dev --name init
npm run dev
```

Environment (see `.env.example`): `DATABASE_URL`, `GEMINI_API_KEY`, optional `GEMINI_TEXT_MODEL` / `GEMINI_VISION_MODEL` / `GEMINI_IMAGE_MODEL`, `ANALYSIS_LOCALE` (`tr` default — style commentary language), `STORAGE_DRIVER` (`local` default, or `s3` + S3 vars), `RATE_LIMIT_DISABLED=1` for local load testing.

## Scripts

| command | purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` (0 errors policy) |
| `npm test` | vitest — 35 unit tests (SSRF, parser, scoring, schemas, validation, errors) |
| `npm run prisma:migrate` / `prisma:studio` | database |
| `node scripts/smoke-gemini.mjs [--image]` | **manual** live API smoke test; `--image` consumes image credits. Never runs automatically. |

## Deploying (Vercel)

- Route handlers declare `maxDuration` (uploads 30s · extract 60s · clothing analyze 120s · outfit analyze 180s · generate 300s) — generation needs a plan that allows long function durations.
- Use `STORAGE_DRIVER=s3` with any S3-compatible bucket (`STORAGE_S3_*` vars); the local filesystem driver is for development, since serverless filesystems are ephemeral.
- Set `ANALYSIS_LOCALE` to control the language of the style report (UI itself is English).

## Honesty & limitations (by design)

- **Preview fidelity:** the mannequin image is generated with strict garment-preservation prompting and the original photos as reference inputs, but pixel-perfect fidelity cannot be guaranteed — which is why the UI labels it **"AI Outfit Preview"** and always shows the untouched **"Original Product"** images alongside.
- **URL extraction is honest:** one SSRF-guarded fetch of the public HTML (JSON-LD → OpenGraph → heuristic images). No CAPTCHA/robots evasion, no headless browser. When a shop blocks bots, the UI falls back to *"Please upload the product image instead."*
- **Scoring consistency:** the Interactions API exposes no temperature; determinism is approximated with a fixed seed, a fixed rubric prompt, and server-side recomputation — per-criterion scores are clamped to their maxima and the 0–100 total is always computed by our code, never by the model.
- **SSRF:** hostname blocklists, private/link-local/metadata IP checks on every DNS answer and every redirect hop, port allow-list, byte caps. Residual DNS-rebinding risk (resolve-then-fetch gap) is documented in `src/lib/security/ssrf.ts`.
- **Material claims are hedged** ("appears to be cotton") — the model only sees pictures.
