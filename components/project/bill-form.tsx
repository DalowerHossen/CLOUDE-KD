// path: components/project/bill-form.tsx
'use client';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import { BILL_GROUPINGS, type BillGrouping } from '@/lib/project/input';
import { entryAmount } from '@/lib/project/time';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

const idBody = z.object({ id: z.string() });

export interface BillEntry {
  id: string;
  workDate: string;
  userName: string;
  hours: string;
  rate: string;
  description: string;
}

export function BillForm({
  projectId,
  billingType,
  entries,
  milestones,
  expenses,
  retainerHint,
}: {
  projectId: string;
  billingType: 'hourly' | 'fixed' | 'retainer' | 'non_billable';
  entries: BillEntry[];
  milestones: { id: string; name: string; amount: string }[];
  expenses: { id: string; date: string; description: string; amount: string }[];
  retainerHint: { from: string; to: string };
}): JSX.Element {
  const router = useRouter();
  const [entryIds, setEntryIds] = useState<Set<string>>(
    new Set(billingType === 'fixed' ? [] : entries.map((e) => e.id)),
  );
  const [milestoneIds, setMilestoneIds] = useState<Set<string>>(
    new Set(milestones.map((m) => m.id)),
  );
  const [expenseIds, setExpenseIds] = useState<Set<string>>(new Set(expenses.map((e) => e.id)));
  const [grouping, setGrouping] = useState<BillGrouping>('day');
  const [override, setOverride] = useState('');
  const [from, setFrom] = useState(retainerHint.from);
  const [to, setTo] = useState(retainerHint.to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());

  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void): void => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const totals = useMemo(() => {
    let hours = Money.zero();
    let amount = Money.zero();
    for (const e of entries) {
      if (!entryIds.has(e.id)) continue;
      hours = hours.add(e.hours);
      amount = amount.add(entryAmount(e.hours, override.trim() === '' ? e.rate : override.trim()));
    }
    for (const m of milestones) if (milestoneIds.has(m.id)) amount = amount.add(m.amount);
    for (const x of expenses) if (expenseIds.has(x.id)) amount = amount.add(x.amount);
    return { hours: hours.toDbString().slice(0, -2), amount };
  }, [entries, entryIds, milestones, milestoneIds, expenses, expenseIds, override]);

  async function create(): Promise<void> {
    setBusy(true);
    setError(null);
    const r = await callJson(
      `/api/projects/${projectId}/bill`,
      'POST',
      {
        entryIds: [...entryIds],
        milestoneIds: [...milestoneIds],
        expenseIds: [...expenseIds],
        grouping,
        rateOverride: override.trim() === '' ? null : override.trim(),
        retainerFrom: billingType === 'retainer' && entryIds.size > 0 ? from : null,
        retainerTo: billingType === 'retainer' && entryIds.size > 0 ? to : null,
      },
      { 'idempotency-key': key.current },
    );
    if (r.ok) {
      const parsed = idBody.safeParse(r.data);
      if (parsed.success) router.push(`/invoices/${parsed.data.id}`);
    } else {
      key.current = crypto.randomUUID();
      setError(r.message ?? t('s09Projects.bill.error'));
    }
    setBusy(false);
  }

  return (
    <form
      className="space-y-sp-24 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      {billingType === 'fixed' ? (
        <p className="text-muted-foreground">{t('s09Projects.bill.fixedHelp')}</p>
      ) : null}
      {billingType !== 'fixed' ? (
        <section className="space-y-sp-8">
          <h2 className="text-lg font-semibold">{t('s09Projects.bill.entries')}</h2>
          {entries.length === 0 ? (
            <p className="text-muted-foreground">{t('s09Projects.bill.noEntries')}</p>
          ) : (
            <>
              <label className="flex items-center gap-sp-8">
                <input
                  type="checkbox"
                  checked={entryIds.size === entries.length}
                  onChange={(e) =>
                    setEntryIds(e.target.checked ? new Set(entries.map((x) => x.id)) : new Set())
                  }
                />
                {t('s09Projects.bill.selectAll')}
              </label>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <caption className="sr-only">{t('s09Projects.bill.entries')}</caption>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="border-b">
                        <td className="w-8 py-sp-4">
                          <input
                            type="checkbox"
                            aria-label={`${e.workDate} ${e.userName}`}
                            checked={entryIds.has(e.id)}
                            onChange={() => toggle(entryIds, e.id, setEntryIds)}
                          />
                        </td>
                        <td>{e.workDate}</td>
                        <td>{e.userName}</td>
                        <td>{e.description}</td>
                        <td className="text-right">{e.hours}</td>
                        <td className="text-right">{formatMoney(Money.parse(e.rate))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-sp-12 sm:grid-cols-3">
                <label>
                  {t('s09Projects.bill.grouping')}
                  <NativeSelect
                    value={grouping}
                    onChange={(e) =>
                      setGrouping(BILL_GROUPINGS.find((g) => g === e.target.value) ?? 'day')
                    }
                  >
                    {BILL_GROUPINGS.map((g) => (
                      <option key={g} value={g}>
                        {t(`s09Projects.bill.groupings.${g}` as StringKey)}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label>
                  {t('s09Projects.bill.rateOverride')}
                  <Input
                    inputMode="decimal"
                    value={override}
                    onChange={(e) => setOverride(e.target.value)}
                  />
                </label>
              </div>
              {billingType === 'retainer' ? (
                <div className="space-y-sp-4">
                  <div className="flex flex-wrap items-end gap-sp-8">
                    <label>
                      {t('s09Projects.bill.retainerFrom')}
                      <Input
                        type="date"
                        required
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      {t('s09Projects.bill.retainerTo')}
                      <Input
                        type="date"
                        required
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </label>
                  </div>
                  <p className="text-muted-foreground">{t('s09Projects.bill.retainerHelp')}</p>
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}
      <section className="space-y-sp-8">
        <h2 className="text-lg font-semibold">{t('s09Projects.bill.milestonesTitle')}</h2>
        {milestones.length === 0 ? (
          <p className="text-muted-foreground">{t('s09Projects.bill.noMilestones')}</p>
        ) : (
          <ul className="space-y-sp-4">
            {milestones.map((m) => (
              <li key={m.id}>
                <label className="flex items-center gap-sp-8">
                  <input
                    type="checkbox"
                    checked={milestoneIds.has(m.id)}
                    onChange={() => toggle(milestoneIds, m.id, setMilestoneIds)}
                  />
                  {m.name} - {formatMoney(Money.parse(m.amount))}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
      {expenses.length > 0 ? (
        <section className="space-y-sp-8">
          <h2 className="text-lg font-semibold">{t('s09Projects.bill.expensesTitle')}</h2>
          <ul className="space-y-sp-4">
            {expenses.map((x) => (
              <li key={x.id}>
                <label className="flex items-center gap-sp-8">
                  <input
                    type="checkbox"
                    checked={expenseIds.has(x.id)}
                    onChange={() => toggle(expenseIds, x.id, setExpenseIds)}
                  />
                  {x.date} {x.description} - {formatMoney(Money.parse(x.amount))}
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="font-medium" aria-live="polite">
        {t('s09Projects.bill.total', { hours: totals.hours, amount: formatMoney(totals.amount) })}
      </p>
      <Button
        type="submit"
        disabled={busy || (entryIds.size === 0 && milestoneIds.size === 0 && expenseIds.size === 0)}
      >
        {busy ? t('s09Projects.bill.creating') : t('s09Projects.bill.create')}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
