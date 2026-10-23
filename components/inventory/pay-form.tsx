// path: components/inventory/pay-form.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { REMITTANCE_METHODS } from '@/lib/procurement/bills';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export interface PayableBill {
  id: string;
  number: string;
  balance: string;
}

export function PayForm({
  supplierId,
  bills,
  today,
}: {
  supplierId: string;
  bills: PayableBill[];
  today: string;
}): JSX.Element {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<(typeof REMITTANCE_METHODS)[number]>('bank_transfer');
  const [reference, setReference] = useState('');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const picked = bills.flatMap((b) => {
    const v = (amounts[b.id] ?? '').trim();
    return v ? [{ billId: b.id, amount: v }] : [];
  });
  let total = '0';
  try {
    total = Money.sum(picked.map((p) => Money.parse(p.amount))).toDbString();
  } catch {
    total = '0';
  }

  async function save(): Promise<void> {
    if (picked.length === 0) return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch('/api/remittances', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify({
          supplierId,
          amount: total,
          paidOn,
          method,
          reference,
          allocations: picked,
        }),
      });
      if (response.ok) {
        setNote({ ok: true, text: t('s08Crm.bills.payDone') });
        setAmounts({});
        setKey(crypto.randomUUID());
        router.refresh();
      } else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setNote({
          ok: false,
          text: err.success ? err.data.error.message : t('s08Crm.bills.payError'),
        });
      }
    } catch {
      setNote({ ok: false, text: t('s08Crm.bills.payError') });
    }
    setBusy(false);
  }

  if (bills.length === 0) return <></>;
  return (
    <form
      className="space-y-sp-8 rounded-lg border bg-card p-sp-12 print:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="text-lg font-semibold">{t('s08Crm.bills.pay')}</h2>
      {bills.map((b) => (
        <label key={b.id} className="grid items-center gap-sp-8 text-sm sm:grid-cols-3">
          <span>
            {b.number} - {t('s08Crm.bills.balance')}: {formatMoney(Money.parse(b.balance))}
          </span>
          <span className="sm:col-span-2">
            <span className="sr-only">{t('s08Crm.bills.payAllocate')}</span>
            <Input
              inputMode="decimal"
              maxLength={20}
              placeholder={t('s08Crm.bills.payAllocate')}
              value={amounts[b.id] ?? ''}
              onChange={(e) => setAmounts({ ...amounts, [b.id]: e.target.value })}
            />
          </span>
        </label>
      ))}
      <div className="grid gap-sp-8 text-sm sm:grid-cols-3">
        <label>
          {t('s08Crm.bills.payDate')}
          <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
        </label>
        <label>
          {t('s08Crm.bills.payMethod')}
          <NativeSelect
            value={method}
            onChange={(e) => setMethod(e.target.value as (typeof REMITTANCE_METHODS)[number])}
          >
            {REMITTANCE_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`s08Crm.bills.methods.${m}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label>
          {t('s08Crm.bills.payReference')}
          <Input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
        </label>
      </div>
      <p className="text-sm font-semibold">
        {t('s08Crm.bills.payAmount')}: {formatMoney(Money.parse(total))}
      </p>
      {note ? (
        <p role="status" className={note.ok ? 'text-sm' : 'text-sm text-destructive'}>
          {note.text}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || picked.length === 0}>
        {t('s08Crm.bills.paySave')}
      </Button>
    </form>
  );
}
