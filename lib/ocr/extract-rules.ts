// path: lib/ocr/extract-rules.ts
// Receipt fields from OCR text, as pure functions: the vendor, the date, the total and the tax, each with a confidence between 0
// and 1. The confidence of a field is the lower of two numbers: how sure the rule is (a line labelled "Grand total" is surer than the
// largest amount on the page) and how sure the OCR was about the words of the line it used. Amounts are text and are handled with
// Money; the currency is always USD. A field that cannot be found is left out, never guessed.
import { Money } from '@/lib/utils/currency';
import { toInt } from '@/lib/reports/numbers';
import type { OcrLine } from './vision';

export type OcrField = 'vendor' | 'date' | 'total' | 'tax';
export type DateOrder = 'dmy' | 'mdy';

export interface Extraction {
  fields: Partial<Record<OcrField, string>>;
  /** 0 to 1 for each field that was found. */
  confidence: Partial<Record<OcrField, number>>;
}

const low = (a: number, b: number): number => (a < b ? a : b);
const two = (x: number): number => toInt(String(x * 100 + 0.5)) / 100;

/* ---------- amounts ---------- */

/** One amount token as text with up to four decimals, or null. "1,234.56", "1.234,56", "12,50" and "12" are understood. */
export function normaliseAmount(token: string): string | null {
  const t = token.replace(/^[^\d]+|[^\d]+$/g, '');
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const dot = t.lastIndexOf('.');
  const comma = t.lastIndexOf(',');
  let plain: string;
  if (dot >= 0 && comma >= 0) {
    const decimalAt = dot > comma ? dot : comma;
    plain = `${t.slice(0, decimalAt).replace(/[.,]/g, '')}.${t.slice(decimalAt + 1)}`;
  } else if (comma >= 0) {
    plain = /^\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.');
  } else if (dot >= 0 && /^\d{1,3}(\.\d{3}){2,}$/.test(t)) {
    plain = t.replace(/\./g, '');
  } else {
    plain = t;
  }
  if (!/^\d{1,12}(\.\d{1,4})?$/.test(plain)) return null;
  return Money.parse(plain).toDbString();
}

const TOKEN = /\d[\d.,]*\d|\d/g;

/** The amounts on a line in order, leaving out percentages ("15%") and tokens that are part of a longer word. */
export function amountsIn(line: string): string[] {
  const out: string[] = [];
  for (const m of line.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (line[end] === '%' || line.slice(end, end + 2) === ' %') continue;
    if (/[A-Za-z]/.test(line[start - 1] ?? '') || /[A-Za-z]/.test(line[end] ?? '')) continue;
    const v = normaliseAmount(m[0]);
    if (v !== null) out.push(v);
  }
  return out;
}

/** The amount of a labelled line: the last amount on it, or the amount alone on the next line. */
function amountFor(
  lines: readonly OcrLine[],
  i: number,
): { value: string; confidence: number } | null {
  const here = lines[i];
  if (!here) return null;
  const own = amountsIn(here.text);
  const last = own[own.length - 1];
  if (last !== undefined) return { value: last, confidence: here.confidence };
  const next = lines[i + 1];
  if (next && /^[^A-Za-z]*$/.test(next.text)) {
    const n = amountsIn(next.text);
    const v = n[n.length - 1];
    if (v !== undefined) return { value: v, confidence: low(here.confidence, next.confidence) };
  }
  return null;
}

/* ---------- total ---------- */

const NOT_TOTAL =
  /sub\s*-?\s*total|total\s+(tax|vat|gst)|(tax|vat|gst)\s+total|total\s+items?|total\s+qty|total\s+quantity|total\s+saving|total\s+discount|items?\s+total|before\s+tax/i;
const STRONG_TOTAL =
  /grand\s+total|total\s+due|amount\s+due|balance\s+due|amount\s+payable|total\s+payable/i;

function findTotal(lines: readonly OcrLine[]): { value: string; confidence: number } | null {
  let best: { value: string; confidence: number; strength: number } | null = null;
  lines.forEach((line, i) => {
    if (NOT_TOTAL.test(line.text)) return;
    let strength = 0;
    if (STRONG_TOTAL.test(line.text)) strength = 0.95;
    else if (/\btotal\b/i.test(line.text)) strength = 0.85;
    else if (
      /amount\s+paid|\bpaid\b|\bcash\b|\bcard\b/i.test(line.text) &&
      /\bamount\b|\bpaid\b/i.test(line.text)
    )
      strength = 0.55;
    if (strength === 0) return;
    const a = amountFor(lines, i);
    if (a === null) return;
    // The last line of the strongest kind wins: the grand total comes at the end of a receipt.
    if (best === null || strength >= best.strength)
      best = { value: a.value, confidence: two(low(strength, a.confidence)), strength };
  });
  if (best !== null) {
    const b: { value: string; confidence: number } = best;
    return { value: b.value, confidence: b.confidence };
  }
  // No label: the largest amount that has cents, with a low confidence.
  let max: { value: string; confidence: number } | null = null;
  for (const line of lines) {
    if (/phone|tel\b|fax|\bno\.?\s*\d|invoice\s*(no|#)|receipt\s*(no|#)/i.test(line.text)) continue;
    for (const v of amountsIn(line.text)) {
      if (!/\.\d{2}/.test(v) || v.endsWith('.0000')) continue;
      if (!/[.,]\d{2}\b/.test(line.text)) continue;
      if (max === null || Money.parse(v).gt(Money.parse(max.value)))
        max = { value: v, confidence: two(low(0.4, line.confidence)) };
    }
  }
  return max;
}

/* ---------- tax ---------- */

const TAX_LABEL = /\b(tax|vat|[csi]?gst|hst|pst|sales\s+tax|service\s+tax)\b/i;
const NOT_TAX =
  /tax\s+invoice|tax\s+id|tax\s+no|tax\s+number|tax\s+reg|(vat|gst|hst)\s*(no|number|reg|id|#)|taxable|pre-?tax|(tax|vat|gst)\s+(included|inclusive|exempt)|before\s+tax|tax\s+rate/i;
const TAX_TOTAL = /total\s+(tax|vat|gst)|(tax|vat|gst)\s+total/i;

function findTax(lines: readonly OcrLine[]): { value: string; confidence: number } | null {
  const found: { value: string; confidence: number; total: boolean }[] = [];
  lines.forEach((line, i) => {
    if (NOT_TAX.test(line.text) || !TAX_LABEL.test(line.text)) return;
    const a = amountFor(lines, i);
    if (a === null) return;
    found.push({ ...a, total: TAX_TOTAL.test(line.text) });
  });
  if (found.length === 0) return null;
  const total = found.find((f) => f.total);
  if (total) return { value: total.value, confidence: two(low(0.9, total.confidence)) };
  if (found.length === 1) {
    const f = found[0];
    return f ? { value: f.value, confidence: two(low(0.85, f.confidence)) } : null;
  }
  // Several tax lines (for example two taxes): their sum, with less trust.
  let sum = Money.zero();
  let conf = 1;
  for (const f of found) {
    sum = sum.add(Money.parse(f.value));
    conf = low(conf, f.confidence);
  }
  return { value: sum.toDbString(), confidence: two(low(0.7, conf)) };
}

/* ---------- date ---------- */

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthOf = (word: string): number => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;

function validDay(y: number, m: number, d: number): string | null {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d)
    return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const ISO = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/;
const NUMERIC = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/;
const DAY_FIRST_NAME = /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})\b/;
const MONTH_FIRST_NAME = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/;

/** The date a line holds, with how sure the rule is, or null. `today` (YYYY-MM-DD) rejects dates more than a day ahead. */
export function dateIn(
  text: string,
  order: DateOrder,
  today: string,
): { value: string; strength: number } | null {
  const ok = (v: string | null): string | null => {
    if (v === null) return null;
    const limit = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    return v <= limit ? v : null;
  };
  let m = ISO.exec(text);
  if (m) {
    const v = ok(validDay(toInt(m[1]), toInt(m[2]), toInt(m[3])));
    if (v) return { value: v, strength: 0.95 };
  }
  m = DAY_FIRST_NAME.exec(text);
  if (m && monthOf(m[2] ?? '') > 0) {
    const v = ok(validDay(toInt(m[3]), monthOf(m[2] ?? ''), toInt(m[1])));
    if (v) return { value: v, strength: 0.9 };
  }
  m = MONTH_FIRST_NAME.exec(text);
  if (m && monthOf(m[1] ?? '') > 0) {
    const v = ok(validDay(toInt(m[3]), monthOf(m[1] ?? ''), toInt(m[2])));
    if (v) return { value: v, strength: 0.9 };
  }
  m = NUMERIC.exec(text);
  if (m) {
    const a = toInt(m[1]);
    const b = toInt(m[2]);
    const year = (m[3] ?? '').length === 2 ? 2000 + toInt(m[3]) : toInt(m[3]);
    if (a > 12 && b <= 12) {
      const v = ok(validDay(year, b, a));
      if (v) return { value: v, strength: 0.9 };
    } else if (b > 12 && a <= 12) {
      const v = ok(validDay(year, a, b));
      if (v) return { value: v, strength: 0.9 };
    } else {
      // Both could be the month: the order the company set decides, and the rule is less sure (unless both are the same).
      const [d, mo] = order === 'dmy' ? [a, b] : [b, a];
      const v = ok(validDay(year, mo, d));
      if (v) return { value: v, strength: a === b ? 0.9 : 0.65 };
    }
  }
  return null;
}

function findDate(
  lines: readonly OcrLine[],
  order: DateOrder,
  today: string,
): { value: string; confidence: number } | null {
  let best: { value: string; confidence: number } | null = null;
  for (const line of lines) {
    const d = dateIn(line.text, order, today);
    if (d === null) continue;
    const labelled = /\b(date|dated|issued|invoice\s+date)\b/i.test(line.text);
    const strength = labelled && d.strength < 0.95 ? d.strength + 0.05 : d.strength;
    const confidence = two(low(strength, line.confidence));
    // The first date wins; a labelled date replaces an unlabelled one.
    if (best === null || (labelled && confidence > best.confidence))
      best = { value: d.value, confidence };
    if (best !== null && labelled) break;
  }
  return best;
}

/* ---------- vendor ---------- */

const NOT_VENDOR =
  /^(tax\s+)?(invoice|receipt|bill|cash\s+memo|order|welcome|thank|customer|copy|duplicate|official)|@|www\.|https?:|\.com\b|\bphone\b|\btel\b|\bfax\b|\bstreet\b|\bst\.|\broad\b|\brd\b|\bave\b|\bsuite\b|\bfloor\b|\bpo\s*box\b/i;

function findVendor(lines: readonly OcrLine[]): { value: string; confidence: number } | null {
  const limit = lines.length < 8 ? lines.length : 8;
  for (let i = 0; i < limit; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const text = line.text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
    const letters = (text.match(/[A-Za-z]/g) ?? []).length;
    if (letters < 3 || letters < text.length / 2) continue;
    if (NOT_VENDOR.test(text) || /\d{5,}/.test(text)) continue;
    return { value: text.slice(0, 120), confidence: two(low(i < 2 ? 0.7 : 0.55, line.confidence)) };
  }
  return null;
}

/* ---------- everything ---------- */

export function extractReceipt(
  lines: readonly OcrLine[],
  options: { dateOrder: DateOrder; today: string },
): Extraction {
  const fields: Extraction['fields'] = {};
  const confidence: Extraction['confidence'] = {};
  const vendor = findVendor(lines);
  if (vendor) {
    fields.vendor = vendor.value;
    confidence.vendor = vendor.confidence;
  }
  const date = findDate(lines, options.dateOrder, options.today);
  if (date) {
    fields.date = date.value;
    confidence.date = date.confidence;
  }
  const total = findTotal(lines);
  if (total) {
    fields.total = total.value;
    confidence.total = total.confidence;
  }
  const tax = findTax(lines);
  // A tax larger than the total cannot be right: it is dropped, not guessed.
  if (tax && (!total || !Money.parse(tax.value).gt(Money.parse(total.value)))) {
    fields.tax = tax.value;
    confidence.tax = tax.confidence;
  }
  return { fields, confidence };
}
