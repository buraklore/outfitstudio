/**
 * Manual smoke test for the Gemini Interactions API.
 * Run it yourself:   node scripts/smoke-gemini.mjs          (text ping only)
 *                    node scripts/smoke-gemini.mjs --image  (also 1 image call, costs credits)
 * Never wired into npm test / CI on purpose.
 */
import { readFileSync, existsSync } from "node:fs";
import { GoogleGenAI } from "@google/genai";

// Minimal .env loader (no dependency).
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY is not set (.env). Aborting.");
  process.exit(1);
}

const textModel = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";
const imageModel = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
const client = new GoogleGenAI({ apiKey: key });

console.log(`→ text ping on ${textModel} …`);
const t = await client.interactions.create({
  model: textModel,
  input: [{ type: "text", text: "Reply with exactly: OUTFIT_STUDIO_OK" }],
});
console.log("  status:", t.status, "| output:", (t.output_text ?? "").slice(0, 80));

if (process.argv.includes("--image")) {
  console.log(`→ image ping on ${imageModel} … (this consumes image credits)`);
  const g = await client.interactions.create({
    model: imageModel,
    input: [
      {
        type: "text",
        text: "A plain matte light-gray retail mannequin, featureless head, off-white studio background, full body, front view.",
      },
    ],
    response_format: { type: "image", aspect_ratio: "3:4", image_size: "1K" },
  });
  const img = g.output_image;
  console.log("  status:", g.status, "| image bytes:", img ? Buffer.from(img.data, "base64").length : 0);
} else {
  console.log("(skip image call — pass --image to test image generation)");
}
console.log("done.");
