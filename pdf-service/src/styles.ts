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
 * `--brand` (colour) and `--font` (the picked font stack) are set inline on
 * .doc from branding; the @font-face block is embedded ahead of this string
 * by fontFaceCss(branding.font). This string only references `var(--font)`.
 */
export const MODERN_CSS = `
  @page { size: A4; }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
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

  .doc {
    padding: 0 14mm;
    font-family: var(--font, -apple-system, "Segoe UI", Roboto, sans-serif);
  }

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

/**
 * Print stylesheet for the Classic template.
 *
 * Where Modern is borderless and airy, Classic is the traditional Indian
 * tax-invoice look: a continuous ruled frame, a centred masthead, a
 * "TAX INVOICE" banner, fully-gridded line items, and a signature block.
 *
 * The frame is NOT one outer-border div — a single border on a multi-page
 * element only draws on the first and last pages. Instead every section
 * carries its own 1px border and stacks flush via `.section + .section
 * { margin-top: -1px }`, so adjacent borders collapse into one line and a
 * page break still leaves every fragment correctly ruled.
 *
 * The brand colour is used sparingly — the 3px crown stroke, the banner
 * text, the table-header text + its 1.5px underline, and the grand-total
 * band. The ruled grid itself stays neutral grey; too much colour would
 * read as a brochure, not an invoice.
 *
 * `--brand` and `--font` are set inline on .doc from branding.
 */
export const CLASSIC_CSS = `
  @page { size: A4; }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    color: #2b3543;
    font-size: 9.5px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background: #ffffff;
  }

  /* repeat table headers; never split a row or a key block */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .masthead, .banner, .info-strip, .parties,
  .summary, .info, .terms, .foot, .sign { break-inside: avoid; }

  .doc {
    padding: 0 12mm;
    font-family: var(--font, Georgia, "Times New Roman", serif);
  }

  /* every section is bordered; adjacent borders collapse into one line */
  .section { border: 1px solid #b4bcc8; }
  .section + .section { margin-top: -1px; }

  /* the single bold brand stroke, crowning the frame */
  .crown { height: 3px; background: var(--brand); }

  /* ---- masthead ---- */
  .masthead { text-align: center; padding: 11px 16px; }
  .brand-logo {
    max-height: 46px; max-width: 180px;
    object-fit: contain; margin: 0 auto 7px; display: block;
  }
  .biz-name {
    font-size: 20px; font-weight: 700; color: #0f172a;
    letter-spacing: 0.01em;
  }
  .biz-sub {
    font-size: 9px; color: #6b7686; margin-top: 4px;
    line-height: 1.6; white-space: pre-line;
  }
  .biz-gst {
    font-size: 9px; color: #0f172a; font-weight: 600;
    margin-top: 4px; letter-spacing: 0.03em;
  }

  /* ---- banner ---- */
  .banner {
    text-align: center; padding: 5px 0; background: #f7f8fa;
    font-size: 11px; font-weight: 700; letter-spacing: 0.22em;
    text-transform: uppercase; color: var(--brand);
  }

  /* ---- invoice-info strip ---- */
  .info-strip { display: flex; }
  .info-cell { flex: 1; padding: 6px 12px; }
  .info-cell + .info-cell { border-left: 1px solid #b4bcc8; }
  .info-cell .k {
    font-size: 7.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #8b94a3; display: block;
  }
  .info-cell .v {
    font-size: 10.5px; font-weight: 600; color: #0f172a;
    margin-top: 2px; font-variant-numeric: tabular-nums;
  }

  /* ---- parties ---- */
  .parties { display: flex; }
  .party { flex: 1; padding: 7px 12px; }
  .party + .party { border-left: 1px solid #b4bcc8; }
  .party-label {
    font-size: 7.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #8b94a3;
  }
  .party-name {
    font-size: 11.5px; font-weight: 700; color: #0f172a; margin-top: 3px;
  }
  .party-meta {
    font-size: 9px; color: #6b7686; margin-top: 2px;
    line-height: 1.6; white-space: pre-line;
  }

  /* ---- line items ---- */
  table.items { width: 100%; border-collapse: collapse; }
  .items thead th {
    background: #f7f8fa; color: var(--brand);
    font-size: 8px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.05em; padding: 6px 8px; text-align: left;
    white-space: nowrap;
    border-bottom: 1.5px solid var(--brand);
    border-right: 1px solid #b4bcc8;
  }
  .items thead th:last-child { border-right: none; }
  .items thead th.n { text-align: right; }
  .items tbody td {
    padding: 5px 8px; font-size: 9.5px; vertical-align: top;
    border-bottom: 1px solid #d8dde4; border-right: 1px solid #d8dde4;
  }
  .items tbody td:last-child { border-right: none; }
  .items tbody td.n {
    text-align: right; font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .items tbody tr:last-child td { border-bottom: none; }
  .items .idx { color: #8b94a3; width: 24px; }
  .items .desc-main { font-weight: 600; color: #0f172a; }
  .items .sub { color: #8b94a3; font-size: 8.5px; margin-top: 2px; }
  .items .hsn-cell { color: #6b7686; white-space: nowrap; }
  .items .charge-row td { background: #fafbfc; }

  /* ---- summary (words + totals) ---- */
  .summary { display: flex; }
  .summary-words {
    flex: 1; padding: 9px 12px; border-right: 1px solid #b4bcc8;
  }
  .words-label {
    font-size: 7.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #8b94a3;
  }
  .words {
    font-size: 10.5px; color: #0f172a; font-weight: 600;
    margin-top: 4px; line-height: 1.5;
  }
  .summary-totals { width: 250px; flex-shrink: 0; padding: 7px 12px; }
  .t-row {
    display: flex; justify-content: space-between;
    font-size: 9.5px; padding: 2.5px 0;
  }
  .t-row .k { color: #6b7686; }
  .t-row .v { color: #0f172a; font-variant-numeric: tabular-nums; }
  .t-rule { height: 1px; background: #b4bcc8; margin: 4px 0; }
  .t-grand {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-top: 5px; padding: 7px 11px; background: var(--brand);
  }
  .t-grand .k {
    color: #ffffff; font-size: 9.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .t-grand .v {
    color: #ffffff; font-size: 15px; font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .t-note {
    font-size: 8px; color: #8b94a3; text-align: right; margin-top: 6px;
  }

  /* ---- HSN summary ---- */
  table.hsn { width: 100%; border-collapse: collapse; font-size: 8.5px; }
  .hsn thead th {
    background: #f7f8fa; color: #6b7686;
    font-size: 7.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.04em; padding: 5px 8px; text-align: right;
    border-bottom: 1px solid #b4bcc8; border-right: 1px solid #d8dde4;
  }
  .hsn thead th:first-child { text-align: left; }
  .hsn thead th:last-child { border-right: none; }
  .hsn tbody td {
    padding: 5px 8px; text-align: right; color: #2b3543;
    font-variant-numeric: tabular-nums;
    border-bottom: 1px solid #d8dde4; border-right: 1px solid #d8dde4;
  }
  .hsn tbody td:first-child {
    text-align: left; font-weight: 600; color: #0f172a;
  }
  .hsn tbody td:last-child { border-right: none; }
  .hsn tbody tr:last-child td { border-bottom: none; }

  /* ---- info cards (transport, notes) ---- */
  .info { display: flex; }
  .info-card { flex: 1; padding: 7px 12px; }
  .info-card + .info-card { border-left: 1px solid #b4bcc8; }
  .label {
    font-size: 7.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #8b94a3; display: block;
  }
  .info-body {
    font-size: 9px; color: #4b5563; line-height: 1.6;
    white-space: pre-line; margin-top: 4px;
  }

  /* ---- terms ---- */
  .terms { padding: 7px 12px; }
  .terms .info-body { color: #6b7686; }

  /* ---- foot: payment details + signature share the closing row ---- */
  .foot { display: flex; }
  .foot-bank { flex: 1; padding: 8px 12px; border-right: 1px solid #b4bcc8; }
  .foot-sign { width: 200px; flex-shrink: 0; padding: 8px 14px; }
  .bank-grid {
    display: flex; flex-wrap: wrap; gap: 5px 24px; margin-top: 4px;
  }
  .bank-item .bk { font-size: 8px; color: #8b94a3; }
  .bank-item .bv {
    font-size: 9.5px; color: #0f172a; font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  /* signature — in .foot-sign, or a standalone .sign section if no bank */
  .sign { padding: 8px 14px; }
  .foot-sign, .sign { text-align: right; }
  .sign-for { font-size: 9.5px; font-weight: 700; color: #0f172a; }
  .sign-space { height: 26px; }
  .sign-label {
    font-size: 8.5px; color: #6b7686; border-top: 1px solid #b4bcc8;
    display: inline-block; padding-top: 3px; min-width: 130px;
  }
`;
