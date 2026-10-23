// path: components/inventory/bill-form.tsx
'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';
import { computeTotals } from '@/lib/procurement/totals';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import type { BillView } from '@/services/purchase/bills';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

interface Line {
  poLineId: string | null;
  productId: string | null;
  label: string;
  description: string;
  quantity: string;
  unitCost: string;
  taxRate: string;
}

export interface BillFormInitial {
  supplierId: string;
  purchaseOrderId: string | null;
  supplierInvoiceNo: string;
  billDate: string;
  dueDate: string;
  notes: string;
  lines: Line[];
}

const trim = (v: string): string => (v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v);

export function billLinesOf(bill: BillView): Line[] {
  return bill.lines.map((l) => ({
    poLineId: l.poLineId,
    productId: l.productId,
    label: l.productName,
    description: l.description,
    quantity: trim(l.quantity),
    unitCost: trim(l.unitCost),
    taxRate: trim(l.taxRate),
  }));
}

export function BillForm({
  bill,
  initial,
  suppliers,
}: {
  bill: BillView | null;
  initial: BillFormInitial;
  suppliers: { id: string; name: string }[];
}): JSX.Element {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const [invoiceNo, setInvoiceNo] = useState(initial.supplierInvoiceNo);
  const [billDate, setBillDate] = useState(initial.billDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [notes, setNotes] = useState(initial.notes);
  const [lines, setLines] = useState<Line[]>(initial.lines);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const totals = useMemo(() => {
    try {
      return computeTotals(
        lines.map((l) => ({
          quantity: l.quantity || '0',
          unitCost: l.unitCost || '0',
          taxRate: l.taxRate || '0',
        })),
      );
    } catch {
      return null;
    }
  }, [lines]);

  const setLine = (i: number, patch: Partial<Line>): void =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save(): Promise<void> {
    setNote(null);
    if (!supplierId) return setNote({ ok: false, text: t('s08Crm.bills.noSupplier') });
    if (lines.length === 0) return setNote({ ok: false, text: t('s08Crm.bills.needLine') });
    setBusy(true);
    const payload = {
      supplierId,
      purchaseOrderId: initial.purchaseOrderId,
      supplierInvoiceNo: invoiceNo,
      billDate,
      dueDate,
      notes,
      lines: lines.map((l) => ({
        poLineId: l.poLineId,
        productId: l.productId,
        description: l.productId ? '' : l.description,
        quantity: l.quantity,
        unitCost: l.unitCost || '0',
        taxRate: l.taxRate || '0',
      })),
    };
    try {
      const response = await fetch(bill ? `/api/bills/${bill.id}` : '/api/bills', {
        method: bill ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(bill ? { expectedVersion: bill.version, bill: payload } : payload),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const id = z.object({ data: z.object({ id: z.string() }) }).safeParse(json);
        setNote({ ok: true, text: t('s08Crm.bills.saved') });
        if (!bill && id.success) router.replace(`/bills/${id.data.data.id}`);
        router.refresh();
      } else if (response.status === 409) setNote({ ok: false, text: t('s08Crm.bills.conflict') });
      else {
        const err = errorBody.safeParse(json);
        setNote({
          ok: false,
          text: err.success ? err.data.error.message : t('s08Crm.bills.error'),
        });
      }
    } catch {
      setNote({ ok: false, text: t('s08Crm.bills.error') });
    }
    setBusy(false);
  }

  return (
    <form
      className="space-y-sp-16"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <label className="text-sm">
          {t('s08Crm.bills.supplier')}
          <NativeSelect
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            disabled={initial.purchaseOrderId !== null}
            required
          >
            <option value="">{t('s08Crm.bills.noSupplier')}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="text-sm">
          {t('s08Crm.bills.supplierInvoiceNo')}
          <Input value={invoiceNo} maxLength={60} onChange={(e) => setInvoiceNo(e.target.value)} />
        </label>
        <label className="text-sm">
          {t('s08Crm.bills.billDate')}
          <Input
            type="date"
            value={billDate}
            onChange={(e) => setBillDate(e.target.value)}
            required
          />
        </label>
        <label className="text-sm">
          {t('s08Crm.bills.dueDate')}
          <Input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />
        </label>
      </div>
      <section className="space-y-sp-8">
        <h2 className="text-lg font-semibold">{t('s08Crm.bills.lines')}</h2>
        {lines.map((l, i) => (
          <div
            key={`${l.poLineId ?? 'x'}-${i}`}
            className="grid gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm sm:grid-cols-5"
          >
            {l.productId ? (
              <p className="font-medium sm:col-span-5">{l.label}</p>
            ) : (
              <label className="sm:col-span-5">
                {t('s08Crm.bills.lineDescription')}
                <Input
                  value={l.description}
                  maxLength={300}
                  onChange={(e) => setLine(i, { description: e.target.value })}
                />
              </label>
            )}
            <label>
              {t('s08Crm.bills.quantity')}
              <Input
                inputMode="decimal"
                value={l.quantity}
                maxLength={20}
                onChange={(e) => setLine(i, { quantity: e.target.value })}
              />
            </label>
            <label>
              {t('s08Crm.bills.unitCost')}
              <Input
                inputMode="decimal"
                value={l.unitCost}
                maxLength={20}
                onChange={(e) => setLine(i, { unitCost: e.target.value })}
              />
            </label>
            <label>
              {t('s08Crm.bills.taxRate')}
              <Input
                inputMode="decimal"
                value={l.taxRate}
                maxLength={10}
                onChange={(e) => setLine(i, { taxRate: e.target.value })}
              />
            </label>
            <p className="self-end">
              {t('s08Crm.bills.lineTotal')}:{' '}
              {totals ? formatMoney(Money.parse(totals.lineTotals[i] ?? '0')) : '-'}
            </p>
            <Button
              type="button"
              variant="outline"
              className="self-end"
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
            >
              {t('s08Crm.bills.removeLine')}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setLines([
              ...lines,
              {
                poLineId: null,
                productId: null,
                label: '',
                description: '',
                quantity: '1',
                unitCost: '',
                taxRate: '0',
              },
            ])
          }
        >
          {t('s08Crm.bills.addLine')}
        </Button>
      </section>
      <dl className="grid max-w-sm grid-cols-2 gap-sp-4 text-sm">
        <dt>{t('s08Crm.bills.subtotal')}</dt>
        <dd className="text-right">{totals ? formatMoney(Money.parse(totals.subtotal)) : '-'}</dd>
        <dt>{t('s08Crm.bills.tax')}</dt>
        <dd className="text-right">{totals ? formatMoney(Money.parse(totals.taxTotal)) : '-'}</dd>
        <dt className="font-semibold">{t('s08Crm.bills.total')}</dt>
        <dd className="text-right font-semibold">
          {totals ? formatMoney(Money.parse(totals.total)) : '-'}
        </dd>
      </dl>
      <label className="block text-sm">
        {t('s08Crm.bills.notes')}
        <Textarea value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {note ? (
        <p role="status" className={note.ok ? 'text-sm' : 'text-sm text-destructive'}>
          {note.text}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {t('s08Crm.bills.saveDraft')}
      </Button>
    </form>
  );
}
