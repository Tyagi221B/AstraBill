/**
 * Print stylesheet for the Modern template.
 *
 * Every dimension that should scale with the invoice — type, padding, gaps,
 * radii — is in `rem`. One root font-size therefore drives the whole layout.
 * The renderer's fit-to-page pass (see render.ts) measures the content at
 * the default root (11px) and then injects a different root size so the
 * invoice fills the page nicely: a short invoice scales UP to fill, a
 * slightly-long one scales DOWN to stay on one page, a genuinely-long one
 * paginates at the default. The page width (A4) and the .doc mm gutter stay
 * fixed, so scaling type makes content TALLER, never wider — no horizontal
 * clipping. Borders stay px (hairlines).
 *
 * Multi-page model: content flows naturally — there is NO fixed-height page
 * div and NO absolute-positioned footer. Puppeteer paginates; its
 * displayHeaderFooter draws the "Made with AstraBill" + page-number strip on
 * every physical page. The rules that make a page break look deliberate:
 *
 *   - thead { display: table-header-group }  → column headers repeat
 *   - tr { break-inside: avoid }             → no row splits across pages
 *   - .summary / .party / .bank / .info-card → these blocks never split
 *
 * `--brand` (colour) and `--font` (the picked font stack) are set inline on
 * .doc from branding; the @font-face block is embedded ahead of this string
 * by fontFaceCss(branding.font). This string only references `var(--font)`.
 */
export const MODERN_CSS = `
  @page { size: A4; }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  /* Default root; render.ts overrides via an appended <style> per invoice. */
  html { font-size: 11px; }
  body {
    color: #334155;
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
    border-radius: 3px; margin-bottom: 1.3rem;
  }

  /* ---- header ---- */
  .head {
    display: flex; justify-content: space-between;
    gap: 2.8rem; align-items: flex-start;
  }
  .brand-logo {
    max-height: 4.8rem; max-width: 19rem;
    object-fit: contain; margin-bottom: 0.7rem; display: block;
  }
  .brand-name {
    font-size: 2.4rem; font-weight: 700; color: #0f172a;
    letter-spacing: -0.015em; line-height: 1.2;
  }
  .brand-meta {
    font-size: 0.9rem; color: #64748b; margin-top: 0.4rem;
    line-height: 1.55; white-space: pre-line;
  }

  .head-doc { text-align: right; flex-shrink: 0; min-width: 18.4rem; }
  .doc-title {
    font-size: 1.3rem; font-weight: 700; color: var(--brand);
    text-transform: uppercase; letter-spacing: 0.14em;
  }
  .doc-rows { margin-top: 0.8rem; }
  .doc-row {
    display: flex; justify-content: flex-end; gap: 1.4rem;
    font-size: 0.95rem; padding: 0.1rem 0;
  }
  .doc-row .k { color: #94a3b8; }
  .doc-row .v { color: #0f172a; font-weight: 600; min-width: 9.2rem;
    text-align: right; font-variant-numeric: tabular-nums; }
  .status {
    display: inline-block; margin-top: 0.7rem;
    font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.09em; padding: 0.3rem 0.9rem; border-radius: 999px;
    background: #f1f5f9; color: #64748b;
  }

  /* ---- parties ---- */
  .parties { display: flex; gap: 1.2rem; margin-top: 1.6rem; }
  .party {
    flex: 1; border: 1px solid #e7ecf2; border-radius: 0.9rem;
    padding: 0.9rem 1.2rem; background: #ffffff;
  }
  .label {
    font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #94a3b8;
  }
  .party-name {
    font-size: 1.25rem; font-weight: 600; color: #0f172a; margin-top: 0.4rem;
  }
  .party-meta {
    font-size: 0.9rem; color: #64748b; margin-top: 0.3rem;
    line-height: 1.55; white-space: pre-line;
  }

  /* ---- line items ---- */
  table { width: 100%; border-collapse: collapse; }
  .items { margin-top: 1.6rem; }
  .items thead th {
    background: var(--brand); color: #ffffff;
    font-size: 0.8rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.045em; padding: 0.6rem 0.9rem; text-align: left;
    white-space: nowrap;
  }
  .items thead th:first-child { border-radius: 0.6rem 0 0 0.6rem; }
  .items thead th:last-child { border-radius: 0 0.6rem 0.6rem 0; }
  .items thead th.n { text-align: right; }
  .items tbody td {
    padding: 0.65rem 0.9rem; border-bottom: 1px solid #f1f5f9;
    vertical-align: top; font-size: 0.95rem;
  }
  .items tbody td.n {
    text-align: right; font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .items tbody tr:last-child td { border-bottom: none; }
  .items .idx { color: #94a3b8; width: 2.2rem; }
  .items .desc { font-weight: 500; color: #0f172a; }
  .items .sub { color: #94a3b8; font-size: 0.85rem; margin-top: 0.2rem;
    font-weight: 400; }
  .items .hsn-cell { color: #64748b; white-space: nowrap; }
  .items .charge-row td { background: #fbfcfe; }

  /* ---- summary (words + totals) ---- */
  .summary {
    display: flex; gap: 2.6rem; margin-top: 1.6rem; align-items: flex-start;
  }
  .summary-left { flex: 1; padding-top: 0.2rem; }
  .words-label {
    font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #94a3b8;
  }
  .words {
    font-size: 1.1rem; color: #0f172a; font-weight: 600; margin-top: 0.4rem;
    line-height: 1.5;
  }

  .totals { width: 23.4rem; flex-shrink: 0; }
  .t-row {
    display: flex; justify-content: space-between;
    font-size: 0.95rem; padding: 0.3rem 0;
  }
  .t-row .k { color: #64748b; }
  .t-row .v { color: #0f172a; font-variant-numeric: tabular-nums; }
  .t-divide { height: 1px; background: #e7ecf2; margin: 0.4rem 0; }
  .t-grand {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-top: 0.6rem; padding: 0.9rem 1.2rem;
    background: var(--brand); border-radius: 0.9rem;
  }
  .t-grand .k {
    color: #ffffff; font-size: 1rem; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.07em; opacity: 0.85;
  }
  .t-grand .v {
    color: #ffffff; font-size: 1.7rem; font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .t-note {
    font-size: 0.8rem; color: #94a3b8; text-align: right; margin-top: 0.5rem;
  }

  /* ---- HSN summary ---- */
  .hsn-wrap { margin-top: 1.6rem; }
  .hsn { font-size: 0.85rem; }
  .hsn thead th {
    background: #f8fafc; color: #64748b;
    font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; padding: 0.5rem 0.9rem; text-align: right;
  }
  .hsn thead th:first-child { text-align: left; border-radius: 0.6rem 0 0 0.6rem; }
  .hsn thead th:last-child { border-radius: 0 0.6rem 0.6rem 0; }
  .hsn tbody td {
    padding: 0.5rem 0.9rem; border-bottom: 1px solid #f1f5f9;
    text-align: right; font-variant-numeric: tabular-nums; color: #334155;
  }
  .hsn tbody td:first-child {
    text-align: left; font-weight: 600; color: #0f172a;
  }
  .hsn tbody tr:last-child td { border-bottom: none; }

  /* ---- info cards (transport, notes, bank) ---- */
  .info-grid {
    display: flex; gap: 1.2rem; margin-top: 1.4rem; flex-wrap: wrap;
  }
  .info-card {
    flex: 1; min-width: 22rem;
    border: 1px solid #e7ecf2; border-radius: 0.9rem; padding: 1rem 1.3rem;
  }
  .info-card .label { margin-bottom: 0.5rem; display: block; }
  .info-body {
    font-size: 0.9rem; color: #475569; line-height: 1.55;
    white-space: pre-line;
  }
  .bank-grid {
    display: flex; flex-wrap: wrap; gap: 0.6rem 2.2rem; margin-top: 0.2rem;
  }
  .bank-item .bk { font-size: 0.8rem; color: #94a3b8; }
  .bank-item .bv {
    font-size: 0.95rem; color: #0f172a; font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  /* UPI QR — pinned to the right of the bank grid on the modern template
     so the bank fields and the QR sit side-by-side, like a real-bank
     payment slip. The QR scales with rem so the fit-to-page pass keeps
     it crisp. */
  .upi-qr {
    margin-top: 0.8rem; display: flex; gap: 0.7rem; align-items: center;
  }
  .upi-qr img {
    width: 5.4rem; height: 5.4rem; flex: none;
    border: 1px solid #e7ecf2; border-radius: 0.5rem; padding: 0.2rem;
    background: #fff;
  }
  .upi-qr-caption {
    font-size: 0.78rem; color: #64748b; line-height: 1.35; max-width: 9rem;
  }

  /* ---- terms ---- */
  .terms { margin-top: 1.2rem; }
  .terms .info-body { color: #64748b; }
`;

/**
 * Print stylesheet for the Classic template.
 *
 * Like MODERN_CSS, every scalable dimension is in `rem`; the renderer's
 * fit-to-page pass sets the root font-size per invoice. The ruled frame
 * still works under scaling because each section's border is in px
 * (hairline), and `.section + .section { margin-top: -1px }` keeps
 * adjacent borders collapsed into one line at any root size.
 *
 * Where Modern is borderless and airy, Classic is the traditional Indian
 * tax-invoice look: a continuous ruled frame, a centred masthead, a
 * "TAX INVOICE" banner, fully-gridded line items, and a signature block.
 * Per-section borders (not one outer border on the .doc) keep the frame
 * ruled correctly even across a page break — a single outer border would
 * only draw on the first and last pages.
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

  /* Default root; render.ts overrides via an appended <style> per invoice. */
  html { font-size: 11px; }
  body {
    color: #2b3543;
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
  .masthead { text-align: center; padding: 1.1rem 1.6rem; }
  .brand-logo {
    max-height: 4.6rem; max-width: 18rem;
    object-fit: contain; margin: 0 auto 0.7rem; display: block;
  }
  .biz-name {
    font-size: 2.6rem; font-weight: 700; color: #0f172a;
    letter-spacing: 0.01em; line-height: 1.2;
  }
  .biz-sub {
    font-size: 0.9rem; color: #6b7686; margin-top: 0.4rem;
    line-height: 1.6; white-space: pre-line;
  }
  .biz-gst {
    font-size: 0.9rem; color: #0f172a; font-weight: 600;
    margin-top: 0.4rem; letter-spacing: 0.03em;
  }

  /* ---- banner ---- */
  .banner {
    text-align: center; padding: 0.5rem 0; background: #f7f8fa;
    font-size: 1.3rem; font-weight: 700; letter-spacing: 0.22em;
    text-transform: uppercase; color: var(--brand);
  }

  /* ---- invoice-info strip ---- */
  .info-strip { display: flex; }
  .info-cell { flex: 1; padding: 0.6rem 1.2rem; }
  .info-cell + .info-cell { border-left: 1px solid #b4bcc8; }
  .info-cell .k {
    font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #8b94a3; display: block;
  }
  .info-cell .v {
    font-size: 1.05rem; font-weight: 600; color: #0f172a;
    margin-top: 0.2rem; font-variant-numeric: tabular-nums;
  }

  /* ---- parties ---- */
  .parties { display: flex; }
  .party { flex: 1; padding: 0.7rem 1.2rem; }
  .party + .party { border-left: 1px solid #b4bcc8; }
  .party-label {
    font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #8b94a3;
  }
  .party-name {
    font-size: 1.25rem; font-weight: 700; color: #0f172a; margin-top: 0.3rem;
  }
  .party-meta {
    font-size: 0.9rem; color: #6b7686; margin-top: 0.2rem;
    line-height: 1.6; white-space: pre-line;
  }

  /* ---- line items ---- */
  table.items { width: 100%; border-collapse: collapse; }
  .items thead th {
    background: #f7f8fa; color: var(--brand);
    font-size: 0.8rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.05em; padding: 0.6rem 0.8rem; text-align: left;
    white-space: nowrap;
    border-bottom: 1.5px solid var(--brand);
    border-right: 1px solid #b4bcc8;
  }
  .items thead th:last-child { border-right: none; }
  .items thead th.n { text-align: right; }
  .items tbody td {
    padding: 0.5rem 0.8rem; font-size: 0.95rem; vertical-align: top;
    border-bottom: 1px solid #d8dde4; border-right: 1px solid #d8dde4;
  }
  .items tbody td:last-child { border-right: none; }
  .items tbody td.n {
    text-align: right; font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .items tbody tr:last-child td { border-bottom: none; }
  .items .idx { color: #8b94a3; width: 2.4rem; }
  .items .desc-main { font-weight: 600; color: #0f172a; }
  .items .sub { color: #8b94a3; font-size: 0.85rem; margin-top: 0.2rem; }
  .items .hsn-cell { color: #6b7686; white-space: nowrap; }
  .items .charge-row td { background: #fafbfc; }

  /* ---- summary (words + totals) ---- */
  .summary { display: flex; }
  .summary-words {
    flex: 1; padding: 0.9rem 1.2rem; border-right: 1px solid #b4bcc8;
  }
  .words-label {
    font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #8b94a3;
  }
  .words {
    font-size: 1.1rem; color: #0f172a; font-weight: 600;
    margin-top: 0.4rem; line-height: 1.5;
  }
  .summary-totals { width: 25rem; flex-shrink: 0; padding: 0.7rem 1.2rem; }
  .t-row {
    display: flex; justify-content: space-between;
    font-size: 0.95rem; padding: 0.25rem 0;
  }
  .t-row .k { color: #6b7686; }
  .t-row .v { color: #0f172a; font-variant-numeric: tabular-nums; }
  .t-rule { height: 1px; background: #b4bcc8; margin: 0.4rem 0; }
  .t-grand {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-top: 0.5rem; padding: 0.7rem 1.1rem; background: var(--brand);
  }
  .t-grand .k {
    color: #ffffff; font-size: 1rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em;
  }
  .t-grand .v {
    color: #ffffff; font-size: 1.65rem; font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .t-note {
    font-size: 0.8rem; color: #8b94a3; text-align: right; margin-top: 0.6rem;
  }

  /* ---- HSN summary ---- */
  table.hsn { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .hsn thead th {
    background: #f7f8fa; color: #6b7686;
    font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.04em; padding: 0.5rem 0.8rem; text-align: right;
    border-bottom: 1px solid #b4bcc8; border-right: 1px solid #d8dde4;
  }
  .hsn thead th:first-child { text-align: left; }
  .hsn thead th:last-child { border-right: none; }
  .hsn tbody td {
    padding: 0.5rem 0.8rem; text-align: right; color: #2b3543;
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
  .info-card { flex: 1; padding: 0.7rem 1.2rem; }
  .info-card + .info-card { border-left: 1px solid #b4bcc8; }
  .label {
    font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; color: #8b94a3; display: block;
  }
  .info-body {
    font-size: 0.9rem; color: #4b5563; line-height: 1.6;
    white-space: pre-line; margin-top: 0.4rem;
  }

  /* ---- terms ---- */
  .terms { padding: 0.7rem 1.2rem; }
  .terms .info-body { color: #6b7686; }

  /* ---- foot: payment details + signature share the closing row ---- */
  .foot { display: flex; }
  .foot-bank { flex: 1; padding: 0.8rem 1.2rem; border-right: 1px solid #b4bcc8; }
  .foot-sign { width: 20rem; flex-shrink: 0; padding: 0.8rem 1.4rem; }
  .bank-grid {
    display: flex; flex-wrap: wrap; gap: 0.5rem 2.4rem; margin-top: 0.4rem;
  }
  .bank-item .bk { font-size: 0.8rem; color: #8b94a3; }
  .bank-item .bv {
    font-size: 0.95rem; color: #0f172a; font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  /* UPI QR — sits beneath the bank grid inside the foot-bank cell. */
  .upi-qr {
    margin-top: 0.7rem; display: flex; gap: 0.6rem; align-items: center;
  }
  .upi-qr img {
    width: 4.8rem; height: 4.8rem; flex: none;
    border: 1px solid #b4bcc8; padding: 0.15rem; background: #fff;
  }
  .upi-qr-caption {
    font-size: 0.78rem; color: #4b5563; line-height: 1.35;
  }

  /* signature — in .foot-sign, or a standalone .sign section if no bank */
  .sign { padding: 0.8rem 1.4rem; }
  .foot-sign, .sign { text-align: right; }
  .sign-for { font-size: 0.95rem; font-weight: 700; color: #0f172a; }
  .sign-space { height: 2.6rem; }
  .sign-label {
    font-size: 0.85rem; color: #6b7686; border-top: 1px solid #b4bcc8;
    display: inline-block; padding-top: 0.3rem; min-width: 13rem;
  }
`;
