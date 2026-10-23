// path: services/budget/consolidation-rules.ts
// Consolidation of several legal entities as pure functions. Accounts of different companies are lined up by type and code (the
// starting chart gives the same codes). Each intercompany pair names an account in each of two companies (a receivable against a
// payable, revenue against expense); the smaller of the two balances is eliminated from both sides and any difference is shown
// as unreconciled. All amounts are USD, so no currency translation is needed. A member owned for less than 100 percent is
// consolidated in full and the share of the others in its result is shown apart.
import { z } from 'zod';
import { Money } from '@/lib/utils/currency';
import {
  signed,
  type AccountMeta,
  type AccountType,
  type Balance,
} from '@/services/accounting/report-rules';

const plain = (min: number, max: number): z.ZodEffects<z.ZodString, string, string> =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' });

export const groupInput = z.object({ name: plain(1, 120) }).strict();
export const memberInput = z
  .object({
    memberCompanyId: z.string().uuid(),
    ownershipPercent: z
      .string()
      .regex(/^\d{1,3}(\.\d{1,4})?$/, 'Enter a share like 100 or 60.5.')
      .refine((v) => Number(v) > 0 && Number(v) <= 100, {
        message: 'The share is above 0 and at most 100.',
      })
      .default('100'),
  })
  .strict();
export const pairInput = z
  .object({
    label: plain(1, 120),
    companyA: z.string().uuid(),
    accountA: z.string().uuid(),
    companyB: z.string().uuid(),
    accountB: z.string().uuid(),
  })
  .strict()
  .refine((v) => v.companyA !== v.companyB, {
    message: 'Choose two different companies.',
    path: ['companyB'],
  });

export interface MemberBooks {
  companyId: string;
  name: string;
  ownershipPercent: string;
  accounts: readonly AccountMeta[];
  balances: readonly Balance[];
}

export interface PairSpec {
  label: string;
  companyA: string;
  accountA: string;
  companyB: string;
  accountB: string;
}

export interface ConsolidatedLine {
  type: AccountType;
  code: string;
  name: string;
  /** The signed amount of each member, in the order of `members`. */
  byMember: string[];
  elimination: string;
  total: string;
}

export interface EliminationRow {
  label: string;
  amountA: string;
  amountB: string;
  eliminated: string;
  /** What did not cancel; zero means the two companies agree. */
  difference: string;
}

export interface Consolidation {
  members: { companyId: string; name: string }[];
  lines: ConsolidatedLine[];
  eliminations: EliminationRow[];
  revenue: string;
  expenses: string;
  netIncome: string;
  assets: string;
  liabilities: string;
  equity: string;
  /** Result of revenue and expense accounts not yet closed to retained earnings (balance sheet date). */
  currentEarnings: string;
  balanced: boolean;
  minority: { name: string; percent: string; share: string }[];
}

const key = (a: Pick<AccountMeta, 'type' | 'code'>): string => `${a.type}:${a.code}`;

/** Lines per account, eliminations of the pairs, totals and the balance check. */
export function consolidate(
  members: readonly MemberBooks[],
  pairs: readonly PairSpec[],
): Consolidation {
  const lines = new Map<
    string,
    { type: AccountType; code: string; name: string; by: Money[]; elim: Money }
  >();
  const idAt = new Map<string, { member: number; line: string }>();
  members.forEach((mem, index) => {
    const bal = new Map(mem.balances.map((b) => [b.accountId, b]));
    for (const a of mem.accounts) {
      const b = bal.get(a.id);
      if (!b) continue;
      const amount = signed(a, b);
      if (amount.isZero()) continue;
      const k = key(a);
      const line = lines.get(k) ?? {
        type: a.type,
        code: a.code,
        name: a.name,
        by: members.map(() => Money.zero()),
        elim: Money.zero(),
      };
      line.by[index] = (line.by[index] ?? Money.zero()).add(amount);
      lines.set(k, line);
      idAt.set(`${mem.companyId}:${a.id}`, { member: index, line: k });
    }
  });
  const eliminations: EliminationRow[] = [];
  for (const p of pairs) {
    const a = idAt.get(`${p.companyA}:${p.accountA}`);
    const b = idAt.get(`${p.companyB}:${p.accountB}`);
    const amountA = a ? (lines.get(a.line)?.by[a.member] ?? Money.zero()) : Money.zero();
    const amountB = b ? (lines.get(b.line)?.by[b.member] ?? Money.zero()) : Money.zero();
    const elim = Money.min(amountA.abs(), amountB.abs());
    if (a && elim.isPositive()) {
      const l = lines.get(a.line);
      if (l) l.elim = l.elim.add(amountA.isNegative() ? elim : elim.negate());
    }
    if (b && elim.isPositive()) {
      const l = lines.get(b.line);
      if (l) l.elim = l.elim.add(amountB.isNegative() ? elim : elim.negate());
    }
    eliminations.push({
      label: p.label,
      amountA: amountA.toDbString(),
      amountB: amountB.toDbString(),
      eliminated: elim.toDbString(),
      difference: amountA.abs().sub(amountB.abs()).abs().toDbString(),
    });
  }
  const out: ConsolidatedLine[] = [...lines.values()]
    .sort((x, y) => x.type.localeCompare(y.type) || x.code.localeCompare(y.code))
    .map((l) => ({
      type: l.type,
      code: l.code,
      name: l.name,
      byMember: l.by.map((v) => v.toDbString()),
      elimination: l.elim.toDbString(),
      total: Money.sum(l.by).add(l.elim).toDbString(),
    }));
  const sum = (type: AccountType): Money =>
    Money.sum(out.filter((l) => l.type === type).map((l) => Money.parse(l.total)));
  const revenue = sum('revenue');
  const expenses = sum('expense');
  const net = revenue.sub(expenses);
  const assets = sum('asset');
  const liabilities = sum('liability');
  const equity = sum('equity');
  const minority = members
    .map((m, i) => {
      const own = Money.parse(m.ownershipPercent);
      if (own.gte('100')) return null;
      const memberNet = Money.sum(
        out.filter((l) => l.type === 'revenue').map((l) => Money.parse(l.byMember[i] ?? '0')),
      ).sub(
        Money.sum(
          out.filter((l) => l.type === 'expense').map((l) => Money.parse(l.byMember[i] ?? '0')),
        ),
      );
      return {
        name: m.name,
        percent: Money.parse('100').sub(own).toDbString(),
        share: memberNet.mul(Money.parse('100').sub(own).toDbString()).div('100').toDbString(),
      };
    })
    .filter((m): m is { name: string; percent: string; share: string } => m !== null);
  return {
    members: members.map((m) => ({ companyId: m.companyId, name: m.name })),
    lines: out,
    eliminations,
    revenue: revenue.toDbString(),
    expenses: expenses.toDbString(),
    netIncome: net.toDbString(),
    assets: assets.toDbString(),
    liabilities: liabilities.toDbString(),
    equity: equity.toDbString(),
    currentEarnings: net.toDbString(),
    balanced: assets.eq(liabilities.add(equity).add(net)),
    minority,
  };
}
