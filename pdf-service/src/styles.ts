/**
 * Print stylesheet for the Modern template.
 *
 * Stage 1: clean, structurally complete, deliberately restrained. The
 * "premium" typography + spacing pass is Stage 2 — this is the skeleton
 * that proves the wiring renders.
 *
 * `--brand` is set as an inline CSS variable on the template root from
 * `branding.color`, so this string stays static.
 *
 * Fonts: Stage 1 uses a system stack. Stage 2 bundles Inter / Poppins /
 * Noto as local .woff2 (no CDN — print determinism, see
 * decision/invoice-design-system.md).
 */
export const MODERN_CSS = `
  @page { size: A4; margin: 0; }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue",
      Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 14mm 14mm 16mm;
    position: relative;
    background: #ffffff;
  }

  .accent-bar { height: 4px; background: var(--brand); border-radius: 2px; }

  /* ---- header ---- */
  .header { display: flex; justify-content: space-between; gap: 24px;
    margin-top: 16px; }
  .biz-name { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }
  .biz-meta { font-size: 10px; color: #5b6b84; margin-top: 4px;
    line-height: 1.5; white-space: pre-line; }
  .doc-block { text-align: right; min-width: 200px; }
  .doc-title { font-size: 15px; font-weight: 700; color: var(--brand);
    text-transform: uppercase; letter-spacing: 0.06em; }
  .doc-rows { font-size: 10px; color: #334155; margin-top: 6px;
    line-height: 1.7; }
  .doc-rows .label { color: #94a3b8; display: inline-block; min-width: 64px;
    text-align: left; }
  .status-pill { display: inline-block; margin-top: 6px; font-size: 8px;
    font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
    padding: 2px 8px; border-radius: 999px; background: #f1f5f9;
    color: #5b6b84; }

  /* ---- parties ---- */
  .parties { display: flex; gap: 16px; margin-top: 22px; }
  .party { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 11px 13px; }
  .party-label { font-size: 8px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: #94a3b8; }
  .party-name { font-size: 12px; font-weight: 600; margin-top: 4px; }
  .party-meta { font-size: 10px; color: #5b6b84; margin-top: 3px;
    line-height: 1.5; white-space: pre-line; }

  /* ---- line items ---- */
  table { width: 100%; border-collapse: collapse; }
  .items { margin-top: 20px; font-size: 10px; }
  .items thead th { background: var(--brand); color: #ffffff;
    font-size: 8.5px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; padding: 7px 8px; text-align: left; }
  .items thead th.num { text-align: right; }
  .items tbody td { padding: 7px 8px; border-bottom: 1px solid #eef2f7;
    vertical-align: top; }
  .items tbody td.num { text-align: right;
    font-variant-numeric: tabular-nums; }
  .items .desc { font-weight: 500; color: #0f172a; }
  .items .sub { color: #94a3b8; font-size: 9px; margin-top: 2px; }

  /* ---- totals ---- */
  .lower { display: flex; gap: 20px; margin-top: 18px;
    align-items: flex-start; }
  .lower-left { flex: 1; }
  .totals { width: 240px; font-size: 10px; }
  .totals .row { display: flex; justify-content: space-between;
    padding: 4px 0; }
  .totals .row .k { color: #5b6b84; }
  .totals .row .v { font-variant-numeric: tabular-nums; }
  .totals .grand { margin-top: 6px; border-top: 2px solid #0f172a;
    padding-top: 7px; font-size: 13px; font-weight: 700; }
  .totals .grand .v { color: var(--brand); }
  .tax-note { font-size: 8px; color: #94a3b8; text-align: right;
    margin-top: 4px; }

  /* ---- blocks ---- */
  .block { margin-top: 14px; }
  .block-label { font-size: 8px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 4px; }
  .block-body { font-size: 10px; color: #334155; line-height: 1.55;
    white-space: pre-line; }
  .words { font-size: 10px; color: #0f172a; }
  .words strong { font-weight: 600; }

  /* ---- HSN summary ---- */
  .hsn { margin-top: 16px; font-size: 9px; }
  .hsn thead th { background: #f1f5f9; color: #5b6b84; font-size: 8px;
    font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
    padding: 5px 7px; text-align: right; }
  .hsn thead th:first-child { text-align: left; }
  .hsn tbody td { padding: 5px 7px; border-bottom: 1px solid #eef2f7;
    text-align: right; font-variant-numeric: tabular-nums; }
  .hsn tbody td:first-child { text-align: left; font-weight: 500; }

  /* ---- bank ---- */
  .bank { margin-top: 14px; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 10px 13px; }
  .bank-grid { display: flex; gap: 24px; font-size: 9.5px;
    color: #334155; margin-top: 4px; }
  .bank-grid .k { color: #94a3b8; }

  /* ---- footer ---- */
  .footer-mark { position: absolute; left: 0; right: 0; bottom: 7mm;
    text-align: center; font-size: 7.5px; color: #cbd5e1;
    letter-spacing: 0.04em; }
`;
