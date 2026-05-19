/**
 * Classic invoice template — the second V1 template (DECISIONS "V1 template
 * set"). Where Modern is borderless and phone-first, Classic is the
 * traditional Indian tax-invoice look: a continuous ruled frame, a centred
 * masthead, a "TAX INVOICE" banner, a fully-gridded line-items table, and a
 * signature block. Om Glass Enterprises' real paper invoice is the reference.
 *
 * Same RenderRequest as Modern; the body font follows `branding.font` (the
 * global per-business picker — DECISIONS "Branding font set"). Classic earns
 * its character from layout — the ruled grid, the boxes, the masthead — not
 * from forcing a serif, so it stays consistent with whatever font is picked.
 *
 * Multi-page: the content flows; Puppeteer paginates. The ruled frame is a
 * stack of self-bordered `.section`s (not one outer border) so every page
 * fragment stays correctly ruled — see styles.ts CLASSIC_CSS.
 */
import type { CSSProperties } from "react";

import type { InvoiceType, RenderRequest } from "../contract.js";
import { fontFaceCss, fontStack } from "../fonts.js";
import { formatDate, formatInr, trimNumber } from "../format.js";
import { CLASSIC_CSS } from "../styles.js";

const TYPE_LABEL: Record<InvoiceType, string> = {
  tax_invoice: "Tax Invoice",
  estimate: "Estimate",
  cash_receipt: "Cash Receipt",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  delivery_challan: "Delivery Challan",
};

export function Classic({ invoice, branding }: RenderRequest) {
  const { columns } = branding;
  const showHsn = columns.hsn;
  const showDiscount = columns.discount;
  const showTax = columns.tax;
  const showSecondary = columns.secondaryQty;
  const intrastate = invoice.totals.taxClass === "intrastate";
  const t = invoice.totals;
  const biz = invoice.business;
  const bank = biz.bank;
  const tr = invoice.transport;
  const hasTransport = Boolean(tr.mode || tr.vehicleNumber || tr.ewayBillNumber);
  const hasBank = Boolean(
    bank &&
      (bank.accountHolder ||
        bank.accountNumber ||
        bank.ifsc ||
        bank.upiId),
  );
  // Show the pre-GST math breakdown only when something modifies the
  // taxable base. Without it, Subtotal equals Taxable Amount and is noise.
  const showBreakdown =
    Number(t.discountAmount) > 0 || Number(t.extraChargesTaxable) > 0;

  // --brand drives the colour accents; --font follows the global font picker.
  const rootStyle = {
    "--brand": branding.color,
    "--font": fontStack(branding.font),
  } as CSSProperties;

  // The closing signature block — shares the foot row with the bank panel
  // when one exists, otherwise sits in its own section.
  const signature = (
    <>
      <div className="sign-for">For {biz.name}</div>
      <div className="sign-space" />
      <div className="sign-label">Authorised Signatory</div>
    </>
  );

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>
          {`${invoice.number ?? "Draft"} — ${biz.name}`}
        </title>
        <style
          dangerouslySetInnerHTML={{
            __html: fontFaceCss(branding.font) + CLASSIC_CSS,
          }}
        />
      </head>
      <body>
        <div className="doc" style={rootStyle}>
          <div className="crown" />

          {/* ---- masthead ---- */}
          <div className="section masthead">
            {branding.logoUrl && (
              <img
                className="brand-logo"
                src={branding.logoUrl}
                alt={biz.name}
              />
            )}
            <div className="biz-name">{biz.name}</div>
            <div className="biz-sub">
              {biz.address}
              {biz.phone && `\nPhone ${biz.phone}`}
              {biz.email &&
                `${biz.phone ? "   ·   " : "\n"}${biz.email}`}
            </div>
            {biz.gstin && <div className="biz-gst">GSTIN {biz.gstin}</div>}
          </div>

          {/* ---- banner ---- */}
          <div className="section banner">{TYPE_LABEL[invoice.type]}</div>

          {/* ---- invoice-info strip ---- */}
          <div className="section info-strip">
            <div className="info-cell">
              <span className="k">Invoice No.</span>
              <span className="v">{invoice.number ?? "Draft"}</span>
            </div>
            <div className="info-cell">
              <span className="k">Invoice Date</span>
              <span className="v">{formatDate(invoice.issueDate)}</span>
            </div>
            {invoice.dueDate && (
              <div className="info-cell">
                <span className="k">Due Date</span>
                <span className="v">{formatDate(invoice.dueDate)}</span>
              </div>
            )}
            <div className="info-cell">
              <span className="k">Status</span>
              <span className="v" style={{ textTransform: "capitalize" }}>
                {invoice.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          {/* ---- parties ---- */}
          <div className="section parties">
            <div className="party">
              <span className="party-label">Billed to</span>
              <div className="party-name">{invoice.billTo.name}</div>
              <div className="party-meta">
                {invoice.billTo.gstin && `GSTIN ${invoice.billTo.gstin}\n`}
                {invoice.billTo.address}
                {invoice.billTo.phone && `\n${invoice.billTo.phone}`}
              </div>
            </div>
            {invoice.shipTo && (
              <div className="party">
                <span className="party-label">Shipped to</span>
                <div className="party-name">{invoice.shipTo.name}</div>
                <div className="party-meta">{invoice.shipTo.address}</div>
              </div>
            )}
          </div>

          {/* ---- line items ---- */}
          <table className="section items">
            <thead>
              <tr>
                <th className="n">#</th>
                <th>Description</th>
                {showHsn && <th>HSN</th>}
                <th className="n">Qty</th>
                <th className="n">Rate</th>
                {showDiscount && <th className="n">Disc.</th>}
                {showTax && <th className="n">GST</th>}
                <th className="n">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((line, i) => (
                <tr key={i}>
                  <td className="n idx">{i + 1}</td>
                  <td>
                    <div className="desc-main">{line.description}</div>
                    {showSecondary &&
                      line.secondaryQuantity &&
                      line.secondaryUnit && (
                        <div className="sub">
                          {trimNumber(line.secondaryQuantity)}{" "}
                          {line.secondaryUnit}
                        </div>
                      )}
                  </td>
                  {showHsn && (
                    <td className="hsn-cell">{line.hsnCode ?? "—"}</td>
                  )}
                  <td className="n">
                    {trimNumber(line.quantity)} {line.unit}
                  </td>
                  <td className="n">{formatInr(line.unitPrice)}</td>
                  {showDiscount && (
                    <td className="n">
                      {Number(line.discountAmount) > 0
                        ? `−${formatInr(line.discountAmount)}`
                        : "—"}
                    </td>
                  )}
                  {showTax && (
                    <td className="n">{trimNumber(line.gstRate)}%</td>
                  )}
                  <td className="n desc-main">{formatInr(line.amount)}</td>
                </tr>
              ))}
              {invoice.extraCharges.map((charge, i) => (
                <tr key={`x${i}`} className="charge-row">
                  <td className="n idx" />
                  <td>
                    <div className="desc-main">{charge.label}</div>
                    <div className="sub">
                      {charge.taxable
                        ? `Taxable charge · GST ${trimNumber(charge.gstRate ?? "0")}%`
                        : "Non-taxable charge"}
                    </div>
                  </td>
                  {showHsn && <td className="hsn-cell">—</td>}
                  <td className="n" />
                  <td className="n" />
                  {showDiscount && <td className="n" />}
                  {showTax && (
                    <td className="n">
                      {charge.taxable
                        ? `${trimNumber(charge.gstRate ?? "0")}%`
                        : "—"}
                    </td>
                  )}
                  <td className="n desc-main">{formatInr(charge.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ---- summary (words + totals) ---- */}
          <div className="section summary">
            <div className="summary-words">
              <div className="words-label">Amount in words</div>
              <div className="words">{t.totalInWords}</div>
            </div>
            <div className="summary-totals">
              {showBreakdown && (
                <div className="t-row">
                  <span className="k">Subtotal</span>
                  <span className="v">{formatInr(t.subtotal)}</span>
                </div>
              )}
              {Number(t.discountAmount) > 0 && (
                <div className="t-row">
                  <span className="k">Discount</span>
                  <span className="v">−{formatInr(t.discountAmount)}</span>
                </div>
              )}
              {Number(t.extraChargesTaxable) > 0 && (
                <div className="t-row">
                  <span className="k">Taxable charges</span>
                  <span className="v">{formatInr(t.extraChargesTaxable)}</span>
                </div>
              )}
              <div className="t-row">
                <span className="k">Taxable Amount</span>
                <span className="v">{formatInr(t.taxableAmount)}</span>
              </div>
              {t.taxBreakdown.flatMap((b) =>
                intrastate
                  ? [
                      <div className="t-row" key={`cgst-${b.rate}`}>
                        <span className="k">
                          CGST @{trimNumber(b.cgstRate)}%
                        </span>
                        <span className="v">{formatInr(b.cgstAmount)}</span>
                      </div>,
                      <div className="t-row" key={`sgst-${b.rate}`}>
                        <span className="k">
                          SGST @{trimNumber(b.sgstRate)}%
                        </span>
                        <span className="v">{formatInr(b.sgstAmount)}</span>
                      </div>,
                    ]
                  : [
                      <div className="t-row" key={`igst-${b.rate}`}>
                        <span className="k">
                          IGST @{trimNumber(b.igstRate)}%
                        </span>
                        <span className="v">{formatInr(b.igstAmount)}</span>
                      </div>,
                    ],
              )}
              {Number(t.extraChargesNonTaxable) > 0 && (
                <div className="t-row">
                  <span className="k">Freight / other</span>
                  <span className="v">
                    {formatInr(t.extraChargesNonTaxable)}
                  </span>
                </div>
              )}
              {t.roundOff !== "0.00" && t.roundOff !== "0" && (
                <div className="t-row">
                  <span className="k">Round-off</span>
                  <span className="v">{formatInr(t.roundOff)}</span>
                </div>
              )}
              <div className="t-rule" />
              <div className="t-grand">
                <span className="k">Total</span>
                <span className="v">{formatInr(t.total)}</span>
              </div>
              <div className="t-note">
                {intrastate
                  ? "Intrastate supply — CGST + SGST"
                  : "Interstate supply — IGST"}
              </div>
            </div>
          </div>

          {/* ---- HSN summary ---- */}
          {showHsn && invoice.hsnSummary.length > 0 && (
            <table className="section hsn">
              <thead>
                <tr>
                  <th>HSN / SAC</th>
                  <th>Taxable value</th>
                  {intrastate ? (
                    <>
                      <th>CGST</th>
                      <th>SGST</th>
                    </>
                  ) : (
                    <th>IGST</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {invoice.hsnSummary.map((row, i) => (
                  <tr key={i}>
                    <td>{row.hsnCode}</td>
                    <td>{formatInr(row.taxableValue)}</td>
                    {intrastate ? (
                      <>
                        <td>
                          {row.cgstRate}% · {formatInr(row.cgstAmount)}
                        </td>
                        <td>
                          {row.sgstRate}% · {formatInr(row.sgstAmount)}
                        </td>
                      </>
                    ) : (
                      <td>
                        {row.igstRate}% · {formatInr(row.igstAmount)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ---- transport + notes ---- */}
          {(hasTransport || invoice.notes) && (
            <div className="section info">
              {hasTransport && (
                <div className="info-card">
                  <span className="label">Transport</span>
                  <div className="info-body">
                    {[
                      tr.mode && `Mode — ${tr.mode}`,
                      tr.vehicleNumber && `Vehicle — ${tr.vehicleNumber}`,
                      tr.ewayBillNumber &&
                        `E-way bill — ${tr.ewayBillNumber}`,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  </div>
                </div>
              )}
              {invoice.notes && (
                <div className="info-card">
                  <span className="label">Notes</span>
                  <div className="info-body">{invoice.notes}</div>
                </div>
              )}
            </div>
          )}

          {/* ---- terms ---- */}
          {invoice.terms && (
            <div className="section terms">
              <span className="label">Terms &amp; conditions</span>
              <div className="info-body">{invoice.terms}</div>
            </div>
          )}

          {/* ---- foot: payment details + signature ---- */}
          {hasBank && bank ? (
            <div className="section foot">
              <div className="foot-bank">
                <span className="label">Payment details</span>
                <div className="bank-grid">
                  {bank.accountHolder && (
                    <div className="bank-item">
                      <div className="bk">Account name</div>
                      <div className="bv">{bank.accountHolder}</div>
                    </div>
                  )}
                  {bank.accountNumber && (
                    <div className="bank-item">
                      <div className="bk">Account no.</div>
                      <div className="bv">{bank.accountNumber}</div>
                    </div>
                  )}
                  {bank.ifsc && (
                    <div className="bank-item">
                      <div className="bk">IFSC</div>
                      <div className="bv">{bank.ifsc}</div>
                    </div>
                  )}
                  {bank.upiId && (
                    <div className="bank-item">
                      <div className="bk">UPI ID</div>
                      <div className="bv">{bank.upiId}</div>
                    </div>
                  )}
                </div>
              </div>
              <div className="foot-sign">{signature}</div>
            </div>
          ) : (
            <div className="section sign">{signature}</div>
          )}
        </div>
      </body>
    </html>
  );
}
