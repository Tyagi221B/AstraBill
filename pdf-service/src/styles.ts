/**
 * Print stylesheet for the Modern template.
 *
 * Multi-page model: content flows naturally — there is NO fixed-height page
 * div and NO absolute-positioned footer. Puppeteer paginates; its
 * displayHeaderFooter draws the "Made with AstraBill" + page-number strip on
 * every physical page (see render.ts). The rules that make a page break look
 * deliberate:
 *
 *   - thead { display: table-header-group }  → column headers repeat
 *   - tr { break-inside: avoid }             → no row splits across pages
 *   - .summary / .party / .bank / .info-card → these blocks never split;
 *                                              if they don't fit they move
 *                                              whole to the next page
 *
 * Spacing is deliberately tight: a typical invoice (3-12 line items + every
 * section) must land on ONE page. An invoice only paginates when it is
 * genuinely long — never because the rhythm was loose enough to strand a
 * lone block on page 2.
 *
 * `--brand` is set inline on .doc from branding.color. Inter is embedded via
 * INTER_FONT_CSS (fonts.ts); this string only references the family.
 */
export const MODERN_CSS = `
  @page { size: A4; }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    font-family: 'Inter', -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #334155;
    font-size: 9.5px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background: #ffffff;
  }

  /* repeat table headers; never split a row or a key block */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .summary, .party, .bank, .info-card { break-inside: avoid; }

  .doc { padding: 0 14mm; }

  /* ---- top accent ---- */
  .accent {
    height: 3px; background: var(--brand);
    border-radius: 3px; margin-bottom: 13px;
  }

  /* ---- header ---- */
  .head {
    display: flex; justify-content: space-between;
    gap: 28px; align-items: flex-start;
  }
  .brand-logo {
    max-height: 48px; max-width: 190px;
    object-fit: contain; margin-bottom: 7px; display: block;
  }
  .brand-name {
    font-size: 18px; font-weight: 700; color: #0f172a;
    letter-spacing: -0.015em;
  }
  .brand-meta {
    font-size: 9px; color: #64748b; margin-top: 4px;
    line-height: 1.55; white-space: pre-line;
  }

  .head-doc { text-align: right; flex-shrink: 0; min-width: 184px; }
  .doc-title {
    font-size: 12px; font-weight: 700; color: var(--brand);
    text-transform: uppercase; letter-spacing: 0.14em;
  }
  .doc-rows { margin-top: 8px; }
  .doc-row {
    display: flex; justify-content: flex-end; gap: 14px;
    font-size: 9.5px; padding: 1px 0;
  }
  .doc-row .k { color: #94a3b8; }
  .doc-row .v { color: #0f172a; font-weight: 600; min-width: 92px;
    text-align: right; font-variant-numeric: tabular-nums; }
  .status {
    display: inline-block; margin-top: 7px;
    font-size: 7.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.09em; padding: 3px 9px; border-radius: 999px;
    background: #f1f5f9; color: #64748b;
  }

  /* ---- parties ---- */
  .parties { display: flex; gap: 12px; margin-top: 16px; }
  .party {
    flex: 1; border: 1px solid #e7ecf2; border-radius: 9px;
    padding: 9px 12px; background: #ffffff;
  }
  .label {
    font-size: 7.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #94a3b8;
  }
  .party-name {
    font-size: 11.5px; font-weight: 600; color: #0f172a; margin-top: 4px;
  }
  .party-meta {
    font-size: 9px; color: #64748b; margin-top: 3px;
    line-height: 1.55; white-space: pre-line;
  }

  /* ---- line items ---- */
  table { width: 100%; border-collapse: collapse; }
  .items { margin-top: 16px; }
  .items thead th {
    background: var(--brand); color: #ffffff;
    font-size: 8px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.045em; padding: 6px 9px; text-align: left;
    white-space: nowrap;
  }
  .items thead th:first-child { border-radius: 6px 0 0 6px; }
  .items thead th:last-child { border-radius: 0 6px 6px 0; }
  .items thead th.n { text-align: right; }
  .items tbody td {
    padding: 6.5px 9px; border-bottom: 1px solid #f1f5f9;
    vertical-align: top; font-size: 9.5px;
  }
  .items tbody td.n {
    text-align: right; font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .items tbody tr:last-child td { border-bottom: none; }
  .items .idx { color: #94a3b8; width: 22px; }
  .items .desc { font-weight: 500; color: #0f172a; }
  .items .sub { color: #94a3b8; font-size: 8.5px; margin-top: 2px;
    font-weight: 400; }
  .items .hsn-cell { color: #64748b; white-space: nowrap; }
  .items .charge-row td { background: #fbfcfe; }

  /* ---- summary (words + totals) ---- */
  .summary {
    display: flex; gap: 26px; margin-top: 16px; align-items: flex-start;
  }
  .summary-left { flex: 1; padding-top: 2px; }
  .words-label {
    font-size: 7.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #94a3b8;
  }
  .words {
    font-size: 10px; color: #0f172a; font-weight: 600; margin-top: 4px;
    line-height: 1.5;
  }

  .totals { width: 234px; flex-shrink: 0; }
  .t-row {
    display: flex; justify-content: space-between;
    font-size: 9.5px; padding: 3px 0;
  }
  .t-row .k { color: #64748b; }
  .t-row .v { color: #0f172a; font-variant-numeric: tabular-nums; }
  .t-divide { height: 1px; background: #e7ecf2; margin: 4px 0; }
  .t-grand {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-top: 6px; padding: 9px 12px;
    background: var(--brand); border-radius: 9px;
  }
  .t-grand .k {
    color: #ffffff; font-size: 10px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.07em; opacity: 0.85;
  }
  .t-grand .v {
    color: #ffffff; font-size: 16px; font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .t-note {
    font-size: 8px; color: #94a3b8; text-align: right; margin-top: 5px;
  }

  /* ---- HSN summary ---- */
  .hsn-wrap { margin-top: 16px; }
  .hsn { font-size: 8.5px; }
  .hsn thead th {
    background: #f8fafc; color: #64748b;
    font-size: 7.5px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; padding: 5px 9px; text-align: right;
  }
  .hsn thead th:first-child { text-align: left; border-radius: 6px 0 0 6px; }
  .hsn thead th:last-child { border-radius: 0 6px 6px 0; }
  .hsn tbody td {
    padding: 5px 9px; border-bottom: 1px solid #f1f5f9;
    text-align: right; font-variant-numeric: tabular-nums; color: #334155;
  }
  .hsn tbody td:first-child {
    text-align: left; font-weight: 600; color: #0f172a;
  }
  .hsn tbody tr:last-child td { border-bottom: none; }

  /* ---- info cards (transport, notes, bank) ---- */
  .info-grid {
    display: flex; gap: 12px; margin-top: 14px; flex-wrap: wrap;
  }
  .info-card {
    flex: 1; min-width: 220px;
    border: 1px solid #e7ecf2; border-radius: 9px; padding: 10px 13px;
  }
  .info-card .label { margin-bottom: 5px; display: block; }
  .info-body {
    font-size: 9px; color: #475569; line-height: 1.55;
    white-space: pre-line;
  }
  .bank-grid {
    display: flex; flex-wrap: wrap; gap: 6px 22px; margin-top: 2px;
  }
  .bank-item .bk { font-size: 8px; color: #94a3b8; }
  .bank-item .bv {
    font-size: 9.5px; color: #0f172a; font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* ---- terms ---- */
  .terms { margin-top: 12px; }
  .terms .info-body { color: #64748b; }
`;
