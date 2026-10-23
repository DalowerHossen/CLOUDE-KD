// path: services/wallet/statement.ts
// What the owner sees of the ledger: the lines of a period with the balance before and after, and a CSV export. The
// maths is pure (`buildStatement`, `ledgerCsv`); `loadStatement` reads this company's rows only.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';

export interface LedgerLine {
  id: string;
  at: string;
  reason: string;
  referenceType: string;
  referenceId: string | null;
  account: 'available' | 'held';
  amount: Money;
}

export interface Statement {
  from: string;
  to: string;
  opening: { available: Money; held: Money };
  lines: LedgerLine[];
  closing: { available: Money; held: Money };
  /** Money in and money out on the available account in the period. */
  totals: { in: Money; out: Money };
}

/** Pure: opening balances, the lines of the period (any order) and the closing balances. */
export function buildStatement(
  from: string,
  to: string,
  opening: { available: Money; held: Money },
  lines: readonly LedgerLine[],
): Statement {
  const sorted = [...lines].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id),
  );
  let available = opening.available;
  let held = opening.held;
  let money = { in: Money.zero(), out: Money.zero() };
  for (const l of sorted) {
    if (l.account === 'available') {
      available = available.add(l.amount);
      money = l.amount.isPositive()
        ? { in: money.in.add(l.amount), out: money.out }
        : { in: money.in, out: money.out.add(l.amount.abs()) };
    } else held = held.add(l.amount);
  }
  return { from, to, opening, lines: sorted, closing: { available, held }, totals: money };
}

/** A text cell that a spreadsheet would run as a formula starts with a quote mark instead. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function ledgerCsv(lines: readonly LedgerLine[]): string {
  const head = [
    'time (UTC)',
    'reason',
    'reference type',
    'reference id',
    'account',
    'amount (USD)',
  ].join(',');
  const rows = lines.map((l) =>
    [
      csvCell(l.at),
      csvCell(l.reason),
      csvCell(l.referenceType),
      csvCell(l.referenceId ?? ''),
      l.account,
      l.amount.toDbString(),
    ].join(','),
  );
  return `${[head, ...rows].join('\r\n')}\r\n`;
}

async function sums(walletId: string, before: string): Promise<{ available: Money; held: Money }> {
  const { data, error } = await getAdminSupabase()
    .from('ledger_entries')
    .select('account_code, amount')
    .eq('wallet_id', walletId)
    .lt('created_at', before)
    .limit(100_000);
  if (error) throw new InternalError(error);
  let available = Money.zero();
  let held = Money.zero();
  for (const r of data ?? []) {
    const amount = Money.parseRounded(String(r.amount));
    if (r.account_code === 'available') available = available.add(amount);
    else if (r.account_code === 'held') held = held.add(amount);
  }
  return { available, held };
}

/** The statement of a period [from, to) for the wallet of the company (`from` and `to` are dates, UTC). */
export async function loadStatement(
  companyId: string,
  walletId: string,
  from: string,
  to: string,
): Promise<Statement> {
  const admin = getAdminSupabase();
  const start = `${from}T00:00:00.000Z`;
  const end = `${to}T00:00:00.000Z`;
  const { data, error } = await admin
    .from('ledger_entries')
    .select('id, created_at, account_code, amount, posting_id')
    .eq('company_id', companyId)
    .eq('wallet_id', walletId)
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at')
    .limit(20_000);
  if (error) throw new InternalError(error);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => String(r.posting_id)))];
  const postings = new Map<string, { reason: string; type: string; ref: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const part = await admin
      .from('wallet_postings')
      .select('id, reason, reference_type, reference_id')
      .eq('company_id', companyId)
      .in('id', ids.slice(i, i + 200));
    if (part.error) throw new InternalError(part.error);
    for (const p of part.data ?? [])
      postings.set(String(p.id), {
        reason: String(p.reason),
        type: String(p.reference_type),
        ref: p.reference_id ? String(p.reference_id) : null,
      });
  }
  const lines: LedgerLine[] = rows.map((r) => {
    const p = postings.get(String(r.posting_id));
    return {
      id: String(r.id),
      at: String(r.created_at),
      reason: p?.reason ?? '',
      referenceType: p?.type ?? '',
      referenceId: p?.ref ?? null,
      account: String(r.account_code) as 'available' | 'held',
      amount: Money.parseRounded(String(r.amount)),
    };
  });
  return buildStatement(from, to, await sums(walletId, start), lines);
}
