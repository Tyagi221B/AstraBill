/**
 * Font embedding.
 *
 * Fonts are base64-embedded into the stylesheet as data URIs — not linked
 * from a CDN and not referenced by file path. A CDN outage mid-render would
 * silently fall back to Times New Roman on a customer's invoice; a relative
 * path doesn't resolve under Puppeteer's `setContent` (no base URL). Embedding
 * is the only print-deterministic option.
 *
 * Inter ships via @fontsource/inter as .woff2 files; we read four weights at
 * startup, base64 them once, and reuse the string for every render.
 *
 * Stage 2 bundles Inter only (Modern's font). Poppins / Noto Serif / Noto Sans
 * — the rest of the DECISIONS font set — slot in here at Stage 6 alongside the
 * font picker.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const INTER_FILES = join(
  dirname(require.resolve("@fontsource/inter/package.json")),
  "files",
);

const WEIGHTS = [400, 500, 600, 700] as const;

function interFace(weight: number): string {
  const file = join(INTER_FILES, `inter-latin-${weight}-normal.woff2`);
  const base64 = readFileSync(file).toString("base64");
  return (
    `@font-face{` +
    `font-family:'Inter';font-style:normal;font-weight:${weight};` +
    `font-display:block;` +
    `src:url(data:font/woff2;base64,${base64}) format('woff2');` +
    `}`
  );
}

/** Embedded @font-face block for Inter 400/500/600/700. Built once at load. */
export const INTER_FONT_CSS: string = WEIGHTS.map(interFace).join("");
