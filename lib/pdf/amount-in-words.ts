/**
 * Indian-system amount-in-words — "12980.00" → "Twelve Thousand Nine
 * Hundred Eighty Rupees Only".
 *
 * Derived at render time, never stored (DECISIONS — "Amount in words").
 * Grouping is the Indian one: crore, lakh, thousand, hundred.
 */

const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
  "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
  "Eighty", "Ninety",
];

/** 0–99 → words. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const tens = TENS[Math.floor(n / 10)] ?? "";
  const ones = n % 10;
  return ones ? `${tens} ${ONES[ones]}` : tens;
}

/** 0–999 → words, with "Hundred". */
function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (!hundreds) return twoDigits(rest);
  const head = `${ONES[hundreds]} Hundred`;
  return rest ? `${head} ${twoDigits(rest)}` : head;
}

/** Non-negative integer → words, Indian grouping. */
function integerToWords(n: number): string {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const hundreds = n % 1000;

  const parts: string[] = [];
  // Crore can itself run into lakhs/thousands — recurse to stay correct.
  if (crore) parts.push(`${integerToWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundreds) parts.push(threeDigits(hundreds));
  return parts.join(" ");
}

/**
 * Money string ("12980.00", "566.50") → "<words> Rupees [and <words>
 * Paise] Only". Returns the input untouched if it isn't a number.
 */
export function amountInWords(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return value;

  const fixed = n.toFixed(2);
  const dot = fixed.indexOf(".");
  const rupees = Number.parseInt(fixed.slice(0, dot), 10);
  const paise = Number.parseInt(fixed.slice(dot + 1), 10);

  const rupeeWords = `${integerToWords(rupees)} Rupees`;
  if (paise > 0) {
    return `${rupeeWords} and ${twoDigits(paise)} Paise Only`;
  }
  return `${rupeeWords} Only`;
}
