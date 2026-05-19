/**
 * Modern invoice template — the default (DECISIONS "Default template").
 *
 * A React component that receives the full RenderRequest and returns a
 * complete <html> document. renderToStaticMarkup turns it into the HTML
 * string Puppeteer prints.
 *
 * Stage 1: every section is structurally present and correct. Stage 2 is
 * the typography / spacing / logo / bundled-font polish pass.
 */
import type { CSSProperties } from "react";

import type { InvoiceType, RenderRequest } from "../contract.js";
import { formatDate, formatInr } from "../format.js";
import { MODERN_CSS } from "../styles.js";

const TYPE_LABEL: Record<InvoiceType, string> = {
  tax_invoice: "Tax Invoice",
  estimate: "Estimate",
  cash_receipt: "Cash Receipt",
  credit_note: "Credit Note",
  debit_note: "Debit Note",
  delivery_challan: "Delivery Challan",
};

export function Modern({ invoice, branding }: RenderRequest) {
  const { columns } = branding;
  const showHsn = columns.hsn;
  const showDiscount = columns.discount;
  const showTax = columns.tax;
  const showSecondary = columns.secondaryQty;
  const intrastate = invoice.totals.taxClass === "intrastate";

  const rootStyle = { "--brand": branding.color } as CSSProperties;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{invoice.number ?? "Draft"} — {invoice.business.name}</title>
        <style dangerouslySetInnerHTML={{ __html: MODERN_CSS }} />
      </head>
      <body>
        <div className="page" style={rootStyle}>
          <div className="accent-bar" />

          {/* ---- header ---- */}
          <div className="header">
            <div>
              <div className="biz-name">{invoice.business.name}</div>
              <div className="biz-meta">
                {invoice.business.gstin && `GSTIN ${invoice.business.gstin}\n`}
                {invoice.business.address}
                {invoice.business.phone && `\n${invoice.business.phone}`}
                {invoice.business.email && `  ·  ${invoice.business.email}`}
              </div>
            </div>
            <div className="doc-block">
              <div className="doc-title">{TYPE_LABEL[invoice.type]}</div>
              <div className="doc-rows">
                <div>
                  <span className="label">Number</span>
                  {invoice.number ?? "Draft"}
                </div>
                <div>
                  <span className="label">Issued</span>
                  {formatDate(invoice.issueDate)}
                </div>
                {invoice.dueDate && (
                  <div>
                    <span className="label">Due</span>
                    {formatDate(invoice.dueDate)}
                  </div>
                )}
              </div>
              <div className="status-pill">{invoice.status.replace("_", " ")}</div>
            </div>
          </div>

          {/* ---- parties ---- */}
          <div className="parties">
            <div className="party">
              <div className="party-label">Bill to</div>
              <div className="party-name">{invoice.billTo.name}</div>
              <div className="party-meta">
                {invoice.billTo.gstin && `GSTIN ${invoice.billTo.gstin}\n`}
                {invoice.billTo.address}
                {invoice.billTo.phone && `\n${invoice.billTo.phone}`}
              </div>
            </div>
            {invoice.shipTo && (
              <div className="party">
                <div className="party-label">Ship to</div>
                <div className="party-name">{invoice.shipTo.name}</div>
                <div className="party-meta">{invoice.shipTo.address}</div>
              </div>
            )}
          </div>

          {/* ---- line items ---- */}
          <table className="items">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                {showHsn && <th>HSN</th>}
                <th className="num">Qty</th>
                <th className="num">Rate</th>
                {showDiscount && <th className="num">Disc.</th>}
                {showTax && <th className="num">GST</th>}
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((line, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>
                    <div className="desc">{line.description}</div>
                    {showSecondary &&
                      line.secondaryQuantity &&
                      line.secondaryUnit && (
                        <div className="sub">
                          {line.secondaryQuantity} {line.secondaryUnit}
                        </div>
                      )}
                  </td>
                  {showHsn && <td>{line.hsnCode ?? "—"}</td>}
                  <td className="num">
                    {line.quantity} {line.unit}
                  </td>
                  <td className="num">{formatInr(line.unitPrice)}</td>
                  {showDiscount && (
                    <td className="num">
                      {Number(line.discountAmount) > 0
                        ? formatInr(line.discountAmount)
                        : "—"}
                    </td>
                  )}
                  {showTax && <td className="num">{line.gstRate}%</td>}
                  <td className="num">{formatInr(line.amount)}</td>
                </tr>
              ))}
              {invoice.extraCharges.map((charge, i) => (
                <tr key={`x${i}`}>
                  <td />
                  <td>
                    <div className="desc">{charge.label}</div>
                    <div className="sub">
                      {charge.taxable
                        ? `Taxable charge · GST ${charge.gstRate ?? "0"}%`
                        : "Non-taxable charge"}
                    </div>
                  </td>
                  {showHsn && <td>—</td>}
                  <td className="num" />
                  <td className="num" />
                  {showDiscount && <td className="num" />}
                  {showTax && (
                    <td className="num">
                      {charge.taxable ? `${charge.gstRate ?? "0"}%` : "—"}
                    </td>
                  )}
                  <td className="num">{formatInr(charge.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ---- words + totals ---- */}
          <div className="lower">
            <div className="lower-left">
              <div className="words">
                <strong>Amount in words: </strong>
                {invoice.totals.totalInWords}
              </div>
              {invoice.notes && (
                <div className="block">
                  <div className="block-label">Notes</div>
                  <div className="block-body">{invoice.notes}</div>
                </div>
              )}
            </div>
            <div className="totals">
              <div className="row">
                <span className="k">Subtotal</span>
                <span className="v">{formatInr(invoice.totals.subtotal)}</span>
              </div>
              {Number(invoice.totals.discountAmount) > 0 && (
                <div className="row">
                  <span className="k">Discount</span>
                  <span className="v">
                    −{formatInr(invoice.totals.discountAmount)}
                  </span>
                </div>
              )}
              {Number(invoice.totals.extraChargesTaxable) > 0 && (
                <div className="row">
                  <span className="k">Taxable charges</span>
                  <span className="v">
                    {formatInr(invoice.totals.extraChargesTaxable)}
                  </span>
                </div>
              )}
              <div className="row">
                <span className="k">Taxable value</span>
                <span className="v">
                  {formatInr(invoice.totals.taxableAmount)}
                </span>
              </div>
              {intrastate ? (
                <>
                  <div className="row">
                    <span className="k">CGST</span>
                    <span className="v">
                      {formatInr(invoice.totals.cgstAmount)}
                    </span>
                  </div>
                  <div className="row">
                    <span className="k">SGST</span>
                    <span className="v">
                      {formatInr(invoice.totals.sgstAmount)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="row">
                  <span className="k">IGST</span>
                  <span className="v">
                    {formatInr(invoice.totals.igstAmount)}
                  </span>
                </div>
              )}
              {Number(invoice.totals.extraChargesNonTaxable) > 0 && (
                <div className="row">
                  <span className="k">Freight / other</span>
                  <span className="v">
                    {formatInr(invoice.totals.extraChargesNonTaxable)}
                  </span>
                </div>
              )}
              {invoice.totals.roundOff !== "0.00" &&
                invoice.totals.roundOff !== "0" && (
                  <div className="row">
                    <span className="k">Round-off</span>
                    <span className="v">{formatInr(invoice.totals.roundOff)}</span>
                  </div>
                )}
              <div className="row grand">
                <span className="k">Total</span>
                <span className="v">{formatInr(invoice.totals.total)}</span>
              </div>
              <div className="tax-note">
                {intrastate
                  ? "Intrastate supply — CGST + SGST"
                  : "Interstate supply — IGST"}
              </div>
            </div>
          </div>

          {/* ---- HSN summary ---- */}
          {showHsn && invoice.hsnSummary.length > 0 && (
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
          )}

          {/* ---- transport ---- */}
          {(invoice.transport.mode ||
            invoice.transport.vehicleNumber ||
            invoice.transport.ewayBillNumber) && (
            <div className="block">
              <div className="block-label">Transport</div>
              <div className="block-body">
                {[
                  invoice.transport.mode && `Mode: ${invoice.transport.mode}`,
                  invoice.transport.vehicleNumber &&
                    `Vehicle: ${invoice.transport.vehicleNumber}`,
                  invoice.transport.ewayBillNumber &&
                    `E-way bill: ${invoice.transport.ewayBillNumber}`,
                ]
                  .filter(Boolean)
                  .join("    ")}
              </div>
            </div>
          )}

          {/* ---- bank ---- */}
          {invoice.business.bank && (
            <div className="bank">
              <div className="block-label">Payment details</div>
              <div className="bank-grid">
                {invoice.business.bank.accountHolder && (
                  <div>
                    <span className="k">A/c name</span>
                    <br />
                    {invoice.business.bank.accountHolder}
                  </div>
                )}
                {invoice.business.bank.accountNumber && (
                  <div>
                    <span className="k">A/c no.</span>
                    <br />
                    {invoice.business.bank.accountNumber}
                  </div>
                )}
                {invoice.business.bank.ifsc && (
                  <div>
                    <span className="k">IFSC</span>
                    <br />
                    {invoice.business.bank.ifsc}
                  </div>
                )}
                {invoice.business.bank.upiId && (
                  <div>
                    <span className="k">UPI</span>
                    <br />
                    {invoice.business.bank.upiId}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---- terms ---- */}
          {invoice.terms && (
            <div className="block">
              <div className="block-label">Terms &amp; conditions</div>
              <div className="block-body">{invoice.terms}</div>
            </div>
          )}

          {branding.showFooterMark && (
            <div className="footer-mark">Made with AstraBill</div>
          )}
        </div>
      </body>
    </html>
  );
}
