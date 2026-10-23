// path: components/invoice/installments-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import type { InstallmentState } from '@/lib/schedule/installments';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { callJson } from './api-call';

const previewBody = z.object({
  rows: z.array(z.object({ number: z.number(), dueDate: z.string(), amount: z.string() })),
  problems: z.array(z.string()),
});
const money = (v: string): string => formatMoney(Money.parse(v));

export interface InstallmentPart {
  number: number;
  dueDate: string;
  amount: string;
  state: InstallmentState;
  outstanding: string;
}

export function InstallmentsPanel({
  invoiceId,
  parts,
  canManage,
  open,
  today,
}: {
  invoiceId: string;
  parts: InstallmentPart[];
  canManage: boolean;
  /** True when the invoice is sent and not paid, so a plan can be made. */
  open: boolean;
  today: string;
}): JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<'even' | 'custom'>('even');
  const [count, setCount] = useState(3);
  const [firstDue, setFirstDue] = useState(today);
  const [unit, setUnit] = useState<'week' | 'month'>('month');
  const [every, setEvery] = useState(1);
  const [down, setDown] = useState('0');
  const [rows, setRows] = useState<{ dueDate: string; amount: string }[]>([
    { dueDate: today, amount: '' },
    { dueDate: today, amount: '' },
  ]);
  const [shown, setShown] = useState<z.infer<typeof previewBody> | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const body = (): unknown =>
    mode === 'even'
      ? {
          mode,
          count,
          firstDue,
          unit,
          every,
          downPaymentPercent: down.trim() === '' ? '0' : down.trim(),
        }
      : { mode, rows };

  async function run(method: 'PATCH' | 'PUT' | 'DELETE'): Promise<void> {
    setBusy(true);
    setNote(null);
    const r = await callJson(
      `/api/invoices/${invoiceId}/installments`,
      method,
      method === 'DELETE' ? undefined : body(),
    );
    if (r.ok) {
      if (method === 'PATCH') {
        const parsed = previewBody.safeParse(r.data);
        setShown(parsed.success ? parsed.data : null);
      } else {
        setShown(null);
        setNote({
          ok: true,
          text:
            method === 'PUT'
              ? t('s09Recurring.installments.saved')
              : t('s09Recurring.installments.removed'),
        });
        router.refresh();
      }
    } else setNote({ ok: false, text: r.message ?? t('s09Recurring.form.error') });
    setBusy(false);
  }

  return (
    <section className="space-y-sp-12 text-sm print:hidden">
      <h2 className="text-lg font-semibold">{t('s09Recurring.installments.title')}</h2>
      {parts.length === 0 ? (
        <p className="text-muted-foreground">{t('s09Recurring.installments.none')}</p>
      ) : (
        <table className="w-full">
          <caption className="sr-only">{t('s09Recurring.installments.title')}</caption>
          <thead>
            <tr className="border-b text-left">
              <th scope="col" className="py-sp-4">
                {t('s09Recurring.installments.number')}
              </th>
              <th scope="col">{t('s09Recurring.installments.dueDate')}</th>
              <th scope="col" className="text-right">
                {t('s09Recurring.installments.amount')}
              </th>
              <th scope="col" className="text-right">
                {t('s09Recurring.installments.outstanding')}
              </th>
              <th scope="col">{t('s09Recurring.installments.state')}</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => (
              <tr key={p.number} className="border-b">
                <td className="py-sp-4">{p.number}</td>
                <td>{p.dueDate}</td>
                <td className="text-right">{money(p.amount)}</td>
                <td className="text-right">{money(p.outstanding)}</td>
                <td className={p.state === 'overdue' ? 'text-destructive' : undefined}>
                  {t(`s09Recurring.installments.states.${p.state}` as StringKey)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {canManage && open ? (
        <details className="rounded-lg border p-sp-12">
          <summary className="cursor-pointer font-medium">
            {t('s09Recurring.installments.make')}
          </summary>
          <div className="mt-sp-8 space-y-sp-8">
            <NativeSelect
              value={mode}
              onChange={(e) => setMode(e.target.value === 'custom' ? 'custom' : 'even')}
            >
              <option value="even">{t('s09Recurring.installments.even')}</option>
              <option value="custom">{t('s09Recurring.installments.custom')}</option>
            </NativeSelect>
            {mode === 'even' ? (
              <div className="grid gap-sp-8 sm:grid-cols-4">
                <label>
                  {t('s09Recurring.installments.count')}
                  <Input
                    type="number"
                    min={2}
                    max={60}
                    value={count}
                    onChange={(e) => setCount(Math.max(2, e.target.valueAsNumber || 2))}
                  />
                </label>
                <label>
                  {t('s09Recurring.installments.firstDue')}
                  <Input
                    type="date"
                    value={firstDue}
                    onChange={(e) => setFirstDue(e.target.value)}
                  />
                </label>
                <label>
                  {t('s09Recurring.installments.every')}
                  <div className="flex gap-sp-4">
                    <Input
                      type="number"
                      min={1}
                      max={12}
                      value={every}
                      onChange={(e) => setEvery(Math.max(1, e.target.valueAsNumber || 1))}
                    />
                    <NativeSelect
                      value={unit}
                      onChange={(e) => setUnit(e.target.value === 'week' ? 'week' : 'month')}
                    >
                      <option value="month">{t('s09Recurring.installments.unitMonth')}</option>
                      <option value="week">{t('s09Recurring.installments.unitWeek')}</option>
                    </NativeSelect>
                  </div>
                </label>
                <label>
                  {t('s09Recurring.installments.down')}
                  <Input
                    inputMode="decimal"
                    value={down}
                    onChange={(e) => setDown(e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-sp-4">
                {rows.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-sp-8">
                    <label>
                      {t('s09Recurring.installments.dueDate')}
                      <Input
                        type="date"
                        value={r.dueDate}
                        onChange={(e) =>
                          setRows(
                            rows.map((x, j) => (j === i ? { ...x, dueDate: e.target.value } : x)),
                          )
                        }
                      />
                    </label>
                    <label>
                      {t('s09Recurring.installments.amount')}
                      <Input
                        inputMode="decimal"
                        value={r.amount}
                        onChange={(e) =>
                          setRows(
                            rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                          )
                        }
                      />
                    </label>
                    {rows.length > 2 ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                      >
                        {t('s09Recurring.installments.removeRow')}
                      </Button>
                    ) : null}
                  </div>
                ))}
                {rows.length < 60 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRows([...rows, { dueDate: today, amount: '' }])}
                  >
                    {t('s09Recurring.installments.addRow')}
                  </Button>
                ) : null}
              </div>
            )}
            <div className="flex flex-wrap gap-sp-8">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void run('PATCH')}
              >
                {t('s09Recurring.installments.preview')}
              </Button>
              <Button
                type="button"
                disabled={busy || (shown !== null && shown.problems.length > 0)}
                onClick={() => void run('PUT')}
              >
                {t('s09Recurring.installments.save')}
              </Button>
            </div>
            {shown ? (
              <div className="space-y-sp-4">
                <ul className="list-disc pl-sp-16">
                  {shown.rows.map((r) => (
                    <li key={r.number}>
                      {r.number}. {r.dueDate} - {money(r.amount)}
                    </li>
                  ))}
                </ul>
                {shown.problems.map((p) => (
                  <p key={p} role="alert" className="text-destructive">
                    {p}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
      {canManage && parts.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            if (window.confirm(t('s09Recurring.installments.confirmRemove'))) void run('DELETE');
          }}
        >
          {t('s09Recurring.installments.remove')}
        </Button>
      ) : null}
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? undefined : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
