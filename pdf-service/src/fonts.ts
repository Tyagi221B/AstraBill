/**
 * Font embedding.
 *
 * Fonts are base64-embedded into the stylesheet as data URIs — not linked
 * from a CDN and not referenced by file path. A CDN outage mid-render would
 * silently fall back to Times New Roman on a customer's invoice; a relative
 * path doesn't resolve under Puppeteer's `setContent` (no base URL). Embedding
 * is the only print-deterministic option.
 *
 * The DECISIONS font set is four families — `inter` (default), `poppins`,
 * `noto_serif`, `noto_sans` — each shipped as .woff2 by its @fontsource
 * package. `fontFaceCss(font)` reads + base64s ONLY the picked family (a
 * render embeds one font, never all four — keeps the HTML small) and the
 * result is memoised so the disk read happens once per family per process.
 *
 * Devanagari: Poppins and Noto Sans ship a Devanagari subset; Inter and
 * Noto Serif are Latin-only. For the two that have it we embed the
 * Devanagari faces too, so a Hindi business name renders correctly even
 * before the Hindi UI lands (DECISIONS — "noto_sans includes Devanagari").
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { BrandFont } from "./contract.js";

const require = createRequire(import.meta.url);

/** Latin weights every family ships and the templates actually use. */
const WEIGHTS = [400, 500, 600, 700] as const;

/**
 * Devanagari unicode-range (matches @fontsource's own devanagari subset).
 * A face carrying this range is consulted only for these codepoints; Latin
 * text keeps using the Latin face declared before it.
 */
const DEVANAGARI_RANGE =
  "U+0900-097F,U+1CD0-1CF6,U+1CF8-1CF9,U+200C-200D,U+20A8,U+20B9," +
  "U+20F0,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09";

interface FamilyConfig {
  /** CSS family name — used in @font-face and the font-family stack. */
  family: string;
  /** @fontsource package, resolved for its `files/` directory. */
  pkg: string;
  /** Filename slug, e.g. `inter` in `inter-latin-400-normal.woff2`. */
  slug: string;
  /** Whether the package ships a Devanagari subset (400 + 700 only). */
  devanagari: boolean;
  /** Fallback stack appended after the family — serif vs sans matters. */
  fallback: string;
}

const SANS_FALLBACK = `-apple-system,"Segoe UI",Roboto,sans-serif`;
const SERIF_FALLBACK = `Georgia,"Times New Roman",serif`;

const FAMILIES: Record<BrandFont, FamilyConfig> = {
  inter: {
    family: "Inter",
    pkg: "@fontsource/inter",
    slug: "inter",
    devanagari: false,
    fallback: SANS_FALLBACK,
  },
  poppins: {
    family: "Poppins",
    pkg: "@fontsource/poppins",
    slug: "poppins",
    devanagari: true,
    fallback: SANS_FALLBACK,
  },
  noto_serif: {
    family: "Noto Serif",
    pkg: "@fontsource/noto-serif",
    slug: "noto-serif",
    devanagari: false,
    fallback: SERIF_FALLBACK,
  },
  noto_sans: {
    family: "Noto Sans",
    pkg: "@fontsource/noto-sans",
    slug: "noto-sans",
    devanagari: true,
    fallback: SANS_FALLBACK,
  },
};

/** One embedded @font-face rule. `weight` may be a single value or a range. */
function fontFace(
  filePath: string,
  family: string,
  weight: string,
  unicodeRange?: string,
): string {
  const base64 = readFileSync(filePath).toString("base64");
  return (
    `@font-face{` +
    `font-family:'${family}';font-style:normal;font-weight:${weight};` +
    `font-display:block;` +
    (unicodeRange ? `unicode-range:${unicodeRange};` : "") +
    `src:url(data:font/woff2;base64,${base64}) format('woff2');` +
    `}`
  );
}

function buildFontCss(font: BrandFont): string {
  const cfg = FAMILIES[font];
  const filesDir = join(
    dirname(require.resolve(`${cfg.pkg}/package.json`)),
    "files",
  );
  const file = (subset: string, weight: number) =>
    join(filesDir, `${cfg.slug}-${subset}-${weight}-normal.woff2`);

  const blocks = WEIGHTS.map((w) =>
    fontFace(file("latin", w), cfg.family, String(w)),
  );

  if (cfg.devanagari) {
    // The Devanagari subset ships 400 + 700 only. Declared AFTER the Latin
    // faces so it wins for codepoints in DEVANAGARI_RANGE; weight ranges
    // map the missing 500/600 onto the 400 file so no weight tofus.
    blocks.push(
      fontFace(file("devanagari", 400), cfg.family, "400 600", DEVANAGARI_RANGE),
      fontFace(file("devanagari", 700), cfg.family, "700", DEVANAGARI_RANGE),
    );
  }

  return blocks.join("");
}

const cssCache = new Map<BrandFont, string>();

/**
 * Embedded @font-face block for the picked branding font. Built once per
 * family per process, then served from cache.
 */
export function fontFaceCss(font: BrandFont): string {
  let css = cssCache.get(font);
  if (!css) {
    css = buildFontCss(font);
    cssCache.set(font, css);
  }
  return css;
}

/**
 * CSS `font-family` value for the picked branding font — the family followed
 * by a serif/sans fallback. Templates set this on `.doc` (via `--font`) so
 * every glyph inherits it.
 */
export function fontStack(font: BrandFont): string {
  const cfg = FAMILIES[font];
  return `'${cfg.family}',${cfg.fallback}`;
}
