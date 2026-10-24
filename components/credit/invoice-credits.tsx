// path: components/credit/invoice-credits.tsx
'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { CREDIT_REASONS, type CreditReason } from '@/lib/credit/input';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

const idBody = z.object({ id: z.string() });
const money = (v: string): string => formatMoney(Money.parse(v));

export interface CreditPanelProps {
  invoiceId: string;
  kind: string;
  balance: string;
  canCreate: boolean;
  canApply: boolean;
  /** Lines with the quantity that can still be credited. */
  lines: { position: number; description: string; quantity: string; left: string }[];
  applied: {
    id: string;
    sourceType: 'credit_note' | 'deposit';
    sourceId: string;
    amount: string;
  }[];
  available: {
    sourceType: 'credit_note' | 'deposit';
    sourceId: string;
    number: string;
    left: string;
  }[];
}

export function InvoiceCredits(p: CreditPanelProps): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [mode, setMode] = useState<'full' | 'lines'>('full');
  const [qty, setQty] = useState<Record<number, string>>({});
  const [reason, setReason] = useState<CreditReason>('return');
  const [reasonNote, setReasonNote] = useState('');
  const [restock, setRestock] = useState(false);
  const [depMode, setDepMode] = useState<'percent' | 'amount'>('percent');
  const [depValue, setDepValue] = useState('30');
  const [depDesc, setDepDesc] = useState('');
  const [debitReason, setDebitReason] = useState('');
  const [debitDesc, setDebitDesc] = useState('');
  const [debitQty, setDebitQty] = useState('1');
  const [debitPrice, setDebitPrice] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const keys = useRef({
    credit: crypto.randomUUID(),
    deposit: crypto.randomUUID(),
    debit: crypto.randomUUID(),
    apply: crypto.randomUUID(),
  });

  async function post(
    url: string,
    body: unknown,
    key: string,
    after: (data: unknown) => void,
  ): Promise<void> {
    setBusy(true);
    setNote(null);
    const r = await callJson(url, 'POST', body, { 'idempotency-key': key });
    if (r.ok) after(r.data);
    else setNote({ ok: false, text: r.message ?? t('s09Credits.messages.error') });
    setBusy(false);
  }

  const open = (data: unknown, base: string): void => {
    const parsed = idBody.safeParse(data);
    if (parsed.success) router.push(`${base}/${parsed.data.id}`);
  };

  return (
    <section className="space-y-sp-16 text-sm print:hidden">
      <h2 className="text-lg font-semibold">{t('s09Credits.panel.title')}</h2>

      <div className="space-y-sp-4">
        <h3 className="font-medium">{t('s09Credits.panel.appliedTitle')}</h3>
        {p.applied.length === 0 ? (
          <p className="text-muted-foreground">{t('s09Credits.panel.noneApplied')}</p>
        ) : (
          <ul className="list-disc pl-sp-16">
            {p.applied.map((a) => (
              <li key={a.id}>
                {a.sourceType === 'credit_note'
                  ? t('s09Credits.panel.kindCredit')
                  : t('s09Credits.panel.kindDeposit')}
                : {money(a.amount)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {p.canApply ? (
        <div className="space-y-sp-8">
          <h3 className="font-medium">{t('s09Credits.panel.availableTitle')}</h3>
          {p.available.length === 0 ? (
            <p className="text-muted-foreground">{t('s09Credits.panel.noneAvailable')}</p>
          ) : (
            <ul className="space-y-sp-8">
              {p.available.map((a) => {
                const cap = Money.min(Money.parse(a.left), Money.parse(p.balance));
                const value = amounts[a.sourceId] ?? cap.toDbString();
                return (
                  <li key={a.sourceId} className="flex flex-wrap items-end gap-sp-8">
                    <span>
                      {a.sourceType === 'credit_note'
                        ? t('s09Credits.panel.sourceCredit', { number: a.number })
                        : t('s09Credits.panel.sourceDeposit', { number: a.number })}
                      : {t('s09Credits.panel.left', { amount: money(a.left) })}
                    </span>
                    <label>
                      <span className="sr-only">{t('s09Credits.panel.applyAmount')}</span>
                      <Input
                        inputMode="decimal"
                        className="w-32"
                        value={value}
                        onChange={(e) =>
                          setAmounts((c) => ({ ...c, [a.sourceId]: e.target.value }))
                        }
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy || !cap.isPositive()}
                      onClick={() =>
                        void post(
                          `/api/invoices/${p.invoiceId}/credits`,
                          {
                            sourceType: a.sourceType,
                            sourceId: a.sourceId,
                            invoiceId: p.invoiceId,
                            amount: value,
                          },
                          keys.current.apply,
                          () => {
                            keys.current.apply = crypto.randomUUID();
                            setNote({ ok: true, text: t('s09Credits.panel.applied') });
                            router.refresh();
                          },
                        )
                      }
                    >
                      {t('s09Credits.panel.apply')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {p.canCreate && p.kind !== 'deposit' ? (
        <details className="space-y-sp-8 rounded-lg border p-sp-12">
          <summary className="cursor-pointer font-medium">
            {t('s09Credits.panel.writeCredit')}
          </summary>
          <div className="mt-sp-8 space-y-sp-8">
            <NativeSelect
              value={mode}
              onChange={(e) => setMode(e.target.value === 'lines' ? 'lines' : 'full')}
            >
              <option value="full">{t('s09Credits.panel.creditFull')}</option>
              <option value="lines">{t('s09Credits.panel.creditLines')}</option>
            </NativeSelect>
            {mode === 'lines' ? (
              <ul className="space-y-sp-4">
                {p.lines.map((l) => (
                  <li key={l.position} className="flex flex-wrap items-center gap-sp-8">
                    <span className="min-w-0 flex-1 truncate">
                      {l.position}. {l.description}{' '}
                      <span className="text-muted-foreground">
                        {t('s09Credits.lines.left', { left: l.left })}
                      </span>
                    </span>
                    <Input
                      inputMode="decimal"
                      className="w-24"
                      aria-label={t('s09Credits.lines.credit')}
                      value={qty[l.position] ?? ''}
                      placeholder="0"
                      onChange={(e) => setQty((c) => ({ ...c, [l.position]: e.target.value }))}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="block">
              {t('s09Credits.panel.reason')}
              <NativeSelect
                value={reason}
                onChange={(e) =>
                  setReason(CREDIT_REASONS.find((r) => r === e.target.value) ?? 'other')
                }
              >
                {CREDIT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`s09Credits.reasons.${r}` as StringKey)}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="block">
              {t('s09Credits.panel.reasonNote')}
              <Input
                maxLength={1000}
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-sp-8">
              <input
                type="checkbox"
                checked={restock}
                onChange={(e) => setRestock(e.target.checked)}
              />
              {t('s09Credits.panel.returnToStock')}
            </label>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void post(
                  `/api/invoices/${p.invoiceId}/credit-note`,
                  {
                    reason,
                    reasonNote,
                    returnToStock: restock,
                    mode,
                    lines:
                      mode === 'full'
                        ? []
                        : Object.entries(qty)
                            .filter(([, q]) => q.trim() !== '')
                            .map(([position, quantity]) => ({
                              position: z.coerce.number().int().parse(position),
                              quantity: quantity.trim(),
                            })),
                  },
                  keys.current.credit,
                  (d) => {
                    keys.current.credit = crypto.randomUUID();
                    open(d, '/credit-notes');
                  },
                )
              }
            >
              {t('s09Credits.panel.createCredit')}
            </Button>
          </div>
        </details>
      ) : null}

      {p.canCreate && p.kind === 'invoice' ? (
        <details className="space-y-sp-8 rounded-lg border p-sp-12">
          <summary className="cursor-pointer font-medium">
            {t('s09Credits.panel.askDeposit')}
          </summary>
          <div className="mt-sp-8 space-y-sp-8">
            <NativeSelect
              value={depMode}
              onChange={(e) => setDepMode(e.target.value === 'amount' ? 'amount' : 'percent')}
            >
              <option value="percent">{t('s09Credits.panel.depositPercent')}</option>
              <option value="amount">{t('s09Credits.panel.depositAmount')}</option>
            </NativeSelect>
            <label className="block">
              {t('s09Credits.panel.depositValue')}
              <Input
                inputMode="decimal"
                value={depValue}
                onChange={(e) => setDepValue(e.target.value)}
              />
            </label>
            <label className="block">
              {t('s09Credits.panel.depositDescription')}
              <Input maxLength={200} value={depDesc} onChange={(e) => setDepDesc(e.target.value)} />
            </label>
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void post(
                  `/api/invoices/${p.invoiceId}/deposit`,
                  { mode: depMode, value: depValue.trim(), description: depDesc },
                  keys.current.deposit,
                  (d) => {
                    keys.current.deposit = crypto.randomUUID();
                    open(d, '/invoices');
                  },
                )
              }
            >
              {t('s09Credits.panel.createDeposit')}
            </Button>
          </div>
        </details>
      ) : null}

      {p.canCreate && p.kind === 'invoice' ? (
        <details className="space-y-sp-8 rounded-lg border p-sp-12">
          <summary className="cursor-pointer font-medium">
            {t('s09Credits.panel.debitNote')}
          </summary>
          <div className="mt-sp-8 space-y-sp-8">
            <label className="block">
              {t('s09Credits.panel.debitReason')}
              <Input
                maxLength={500}
                value={debitReason}
                onChange={(e) => setDebitReason(e.target.value)}
              />
            </label>
            <label className="block">
              {t('s09Credits.panel.debitDescription')}
              <Input
                maxLength={2000}
                value={debitDesc}
                onChange={(e) => setDebitDesc(e.target.value)}
              />
            </label>
            <div className="flex gap-sp-8">
              <label>
                {t('s09Credits.panel.debitQuantity')}
                <Input
                  inputMode="decimal"
                  value={debitQty}
                  onChange={(e) => setDebitQty(e.target.value)}
                />
              </label>
              <label>
                {t('s09Credits.panel.debitPrice')}
                <Input
                  inputMode="decimal"
                  value={debitPrice}
                  onChange={(e) => setDebitPrice(e.target.value)}
                />
              </label>
            </div>
            <Button
              type="button"
              disabled={
                busy ||
                debitReason.trim().length < 3 ||
                debitDesc.trim() === '' ||
                debitPrice.trim() === ''
              }
              onClick={() =>
                void post(
                  `/api/invoices/${p.invoiceId}/debit-note`,
                  {
                    reason: debitReason.trim(),
                    lines: [
                      {
                        productId: null,
                        variantId: null,
                        sku: '',
                        description: debitDesc.trim(),
                        hsCode: '',
                        quantity: debitQty.trim(),
                        unit: 'each',
                        unitPrice: debitPrice.trim(),
                        discountKind: 'none',
                        discountValue: '0',
                        taxExempt: false,
                        taxCodes: [],
                      },
                    ],
                  },
                  keys.current.debit,
                  (d) => {
                    keys.current.debit = crypto.randomUUID();
                    open(d, '/invoices');
                  },
                )
              }
            >
              {t('s09Credits.panel.createDebit')}
            </Button>
          </div>
        </details>
      ) : null}

      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? undefined : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
