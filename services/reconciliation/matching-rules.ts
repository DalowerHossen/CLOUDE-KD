// path: services/reconciliation/matching-rules.ts
// Matching bank lines to the books: a score for each pair (same amount is required; the nearer the date and the more words they
// share, the higher), suggestions for one bank line, automatic pairs for a whole account (a bank line pairs by itself only when
// one candidate clearly wins, and a journal line is used once), bank rules that book a line by its text, and the entry a
// categorized bank line makes. Pure, no database.
import { Money } from '@/lib/utils/currency';

export interface BankLine {
  id: string;
  date: string;
  amount: string;
  description: string;
  reference: string;
}

/** A line of the books on the ledger account of the bank account. The amount is debit minus credit. */
export interface BookLine {
  lineId: string;
  entryId: string;
  entryNumber: string;
  date: string;
  amount: string;
  memo: string;
  description: string;
}

export interface Suggestion {
  lineId: string;
  entryId: string;
  entryNumber: string;
  date: string;
  memo: string;
  score: number;
  reasons: string[];
}

export const AUTO_MATCH_MIN_SCORE = 60;
export const AUTO_MATCH_MARGIN = 10;
const MAX_DAYS = 45;
const DAY = 86_400_000;

export function daysApart(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY));
}

const STOP = new Set(['the', 'and', 'for', 'payment', 'from', 'with', 'inv', 'ref']);

export function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}

/** The score of a pair, or null when they cannot match (another amount, or more than 45 days apart). */
export function scorePair(t: BankLine, l: BookLine): { score: number; reasons: string[] } | null {
  if (!Money.parse(t.amount).eq(l.amount)) return null;
  const days = daysApart(t.date, l.date);
  if (days > MAX_DAYS) return null;
  const reasons: string[] = ['Same amount'];
  const date =
    days === 0 ? 50 : days <= 2 ? 40 : days <= 5 ? 30 : days <= 10 ? 15 : days <= 30 ? 5 : 0;
  reasons.push(days === 0 ? 'Same date' : `${days} day(s) apart`);
  const bankWords = tokens(`${t.description} ${t.reference}`);
  const bookText = `${l.memo} ${l.description} ${l.entryNumber}`;
  const bookWords = tokens(bookText);
  let shared = 0;
  for (const w of bankWords) if (bookWords.has(w)) shared += 1;
  let text = bankWords.size > 0 ? Math.round((50 * shared) / bankWords.size) : 0;
  if (shared > 0) reasons.push(`${shared} shared word(s)`);
  if (t.reference !== '' && bookText.toLowerCase().includes(t.reference.toLowerCase())) {
    text = Math.min(50, text + 20);
    reasons.push('The reference appears in the entry');
  }
  return { score: date + text, reasons };
}

/** The best candidates for one bank line, best first. */
export function suggest(t: BankLine, lines: readonly BookLine[], limit = 5): Suggestion[] {
  const out: Suggestion[] = [];
  for (const l of lines) {
    const s = scorePair(t, l);
    if (s)
      out.push({
        lineId: l.lineId,
        entryId: l.entryId,
        entryNumber: l.entryNumber,
        date: l.date,
        memo: l.memo,
        score: s.score,
        reasons: s.reasons,
      });
  }
  return out.sort((a, b) => b.score - a.score || a.date.localeCompare(b.date)).slice(0, limit);
}

export interface Pair {
  bankTransactionId: string;
  lineId: string;
  score: number;
}

/**
 * Automatic pairs for many bank lines: a bank line pairs only when its best candidate scores at least 60 and beats the next
 * candidate by 10 or more (or is the only one); each journal line is used once, best pairs first.
 */
export function autoPairs(txns: readonly BankLine[], lines: readonly BookLine[]): Pair[] {
  const candidates = txns.map((t) => ({ t, list: suggest(t, lines, 20) }));
  const wanted: Pair[] = [];
  for (const { t, list } of candidates) {
    const best = list[0];
    if (!best || best.score < AUTO_MATCH_MIN_SCORE) continue;
    const next = list[1];
    if (next && best.score - next.score < AUTO_MATCH_MARGIN) continue;
    wanted.push({ bankTransactionId: t.id, lineId: best.lineId, score: best.score });
  }
  wanted.sort((a, b) => b.score - a.score);
  const usedLines = new Set<string>();
  const out: Pair[] = [];
  for (const p of wanted) {
    if (usedLines.has(p.lineId)) continue;
    usedLines.add(p.lineId);
    out.push(p);
  }
  return out;
}

export interface BankRule {
  id: string;
  name: string;
  bankAccountId: string | null;
  containsText: string;
  direction: 'any' | 'in' | 'out';
  accountId: string;
  memo: string;
  status: 'active' | 'inactive';
}

/** The first active rule whose text is in the description or reference and whose direction fits. */
export function ruleFor(
  rules: readonly BankRule[],
  bankAccountId: string,
  t: BankLine,
): BankRule | null {
  const text = `${t.description} ${t.reference}`.toLowerCase();
  const incoming = Money.parse(t.amount).isPositive();
  for (const r of rules) {
    if (r.status !== 'active') continue;
    if (r.bankAccountId !== null && r.bankAccountId !== bankAccountId) continue;
    if (r.direction === 'in' && !incoming) continue;
    if (r.direction === 'out' && incoming) continue;
    if (text.includes(r.containsText.toLowerCase())) return r;
  }
  return null;
}

export interface EntryLine {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

/** The entry for a bank line booked to an account: a deposit debits the bank, a payment credits it. */
export function categorizeLines(
  t: Pick<BankLine, 'amount' | 'description'>,
  bankLedgerAccountId: string,
  counterAccountId: string,
  memo: string,
): EntryLine[] {
  const amount = Money.parse(t.amount);
  const abs = amount.abs().toDbString();
  const text = (memo || t.description).slice(0, 300);
  return amount.isPositive()
    ? [
        { accountId: bankLedgerAccountId, debit: abs, credit: '0', description: text },
        { accountId: counterAccountId, debit: '0', credit: abs, description: text },
      ]
    : [
        { accountId: counterAccountId, debit: abs, credit: '0', description: text },
        { accountId: bankLedgerAccountId, debit: '0', credit: abs, description: text },
      ];
}
