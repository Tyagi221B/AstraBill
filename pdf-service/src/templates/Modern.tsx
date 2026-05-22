/**
 * Modern invoice template — the default (DECISIONS "Default template").
 *
 * A React component that receives the full RenderRequest and returns a
 * complete <html> document. renderToStaticMarkup turns it into the HTML
 * string Puppeteer prints.
 *
 * Multi-page: the content flows; Puppeteer paginates and draws the per-page
 * footer (render.ts). The CSS keeps rows + key blocks unbroken — see
 * styles.ts.
 */
import type { CSSProperties } from "react";

import type { InvoiceType, RenderRequest } from "../contract.js";
import { fontFaceCss, fontStack } from "../fonts.js";
import { formatDate, formatInr, trimNumber } from "../format.js";
import { MODERN_CSS } from "../styles.js";

const TYPE_LABEL: Record<InvoiceType, string> = {
  sales_invoice: "Tax Invoice",
  estimate: "Estimate",
  delivery_challan: "Delivery Challan",
  credit_note: "Credit Note",
  purchase_invoice: "Purchase Invoice",
  debit_note: "Debit Note",
  quotation: "Quotation",
  proforma_invoice: "Proforma Invoice",
};

export function Modern({ invoice, branding }: RenderRequest) {
  const { columns } = branding;
  const showHsn = columns.hsn;
  const showDiscount = columns.discount;
  const showTax = columns.tax;
  const showSecondary = columns.secondaryQty;
  const intrastate = invoice.totals.taxClass === "intrastate";
  const t = invoice.totals;
  const bank = invoice.business.bank;
  const tr = invoice.transport;
  const hasTransport = Boolean(tr.mode || tr.vehicleNumber || tr.ewayBillNumber);
  // Show the pre-GST math breakdown (Subtotal → Discount → Charges) only
  // when something modifies the taxable base; otherwise Subtotal equals
  // Taxable Amount and the row is just noise. Industry convention.
  const showBreakdown =
    Number(t.discountAmount) > 0 || Number(t.extraChargesTaxable) > 0;

  // --brand drives the colour accents; --font follows the global font picker
  // (DECISIONS — branding font set; the picker is per-business).
  const rootStyle = {
    "--brand": branding.color,
    "--font": fontStack(branding.font),
  } as CSSProperties;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>
          {`${invoice.number ?? "Draft"} — ${invoice.business.name}`}
        </title>
        <style
          dangerouslySetInnerHTML={{
            __html: fontFaceCss(branding.font) + MODERN_CSS,
          }}
        />
      </head>
      <body>
        <div className="doc" style={rootStyle}>
          <div className="accent" />

          {/* ---- header ---- */}
          <div className="head">
            <div className="head-brand">
              {branding.logoUrl && (
                <img
                  className="brand-logo"
                  src={branding.logoUrl}
                  alt={invoice.business.name}
                />
              )}
              <div className="brand-name">{invoice.business.name}</div>
              <div className="brand-meta">
                {invoice.business.gstin && `GSTIN ${invoice.business.gstin}\n`}
                {invoice.business.address}
                {invoice.business.phone && `\n${invoice.business.phone}`}
                {invoice.business.email &&
                  `${invoice.business.phone ? "  ·  " : "\n"}${invoice.business.email}`}
              </div>
            </div>
            <div className="head-doc">
              <div className="doc-title">{TYPE_LABEL[invoice.type]}</div>
              <div className="doc-rows">
                <div className="doc-row">
                  <span className="k">Number</span>
                  <span className="v">{invoice.number ?? "Draft"}</span>
                </div>
                <div className="doc-row">
                  <span className="k">Issued</span>
                  <span className="v">{formatDate(invoice.issueDate)}</span>
                </div>
                {invoice.dueDate && (
                  <div className="doc-row">
                    <span className="k">Due</span>
                    <span className="v">{formatDate(invoice.dueDate)}</span>
                  </div>
                )}
              </div>
              <span className="status">
                {invoice.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>

          {/* ---- parties ---- */}
          <div className="parties">
            <div className="party">
              <span className="label">Bill to</span>
              <div className="party-name">{invoice.billTo.name}</div>
              <div className="party-meta">
                {invoice.billTo.gstin && `GSTIN ${invoice.billTo.gstin}\n`}
                {invoice.billTo.address}
                {invoice.billTo.phone && `\n${invoice.billTo.phone}`}
              </div>
            </div>
            {invoice.shipTo && (
              <div className="party">
                <span className="label">Ship to</span>
                <div className="party-name">{invoice.shipTo.name}</div>
                <div className="party-meta">{invoice.shipTo.address}</div>
              </div>
            )}
          </div>

          {/* ---- line items ---- */}
          <table className="items">
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
                    <div className="desc">{line.description}</div>
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
                  <td className="n desc">{formatInr(line.amount)}</td>
                </tr>
              ))}
              {invoice.extraCharges.map((charge, i) => (
                <tr key={`x${i}`} className="charge-row">
                  <td className="n idx" />
                  <td>
                    <div className="desc">{charge.label}</div>
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
                  <td className="n desc">{formatInr(charge.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ---- summary ---- */}
          <div className="summary">
            <div className="summary-left">
              <div className="words-label">Amount in words</div>
              <div className="words">{t.totalInWords}</div>
            </div>
            <div className="totals">
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
              <div className="t-divide" />
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
            <div className="hsn-wrap">
              <table className="hsn">
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
            </div>
          )}

          {/* ---- transport + notes ---- */}
          {(hasTransport || invoice.notes) && (
            <div className="info-grid">
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

          {/* ---- bank ---- */}
          {bank &&
            (bank.accountHolder ||
              bank.accountNumber ||
              bank.ifsc ||
              bank.upiId) && (
              <div className="info-card" style={{ marginTop: "1.2rem" }}>
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
                {bank.upiQrDataUrl && (
                  <div className="upi-qr">
                    <img
                      src={bank.upiQrDataUrl}
                      alt="Scan to pay via UPI"
                      width={96}
                      height={96}
                    />
                    <div className="upi-qr-caption">
                      Scan to pay via any UPI app
                    </div>
                  </div>
                )}
              </div>
            )}

          {/* ---- terms ---- */}
          {invoice.terms && (
            <div className="terms">
              <div className="info-card">
                <span className="label">Terms &amp; conditions</span>
                <div className="info-body">{invoice.terms}</div>
              </div>
            </div>
          )}
        </div>
      </body>
    </html>
  );
}
