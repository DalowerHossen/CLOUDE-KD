// path: components/inventory/po-form.tsx
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
import type { PoView } from '@/services/purchase/orders';
import type { WarehouseView } from '@/services/inventory/warehouses';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const pickerBody = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      variantId: z.string().nullable(),
      label: z.string(),
      sku: z.string().nullable(),
      taxRate: z.string(),
    }),
  ),
});

interface Line {
  productId: string;
  variantId: string | null;
  label: string;
  quantity: string;
  unitCost: string;
  taxRate: string;
}

const trim = (v: string): string => (v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v);

export function PoForm({
  order,
  suppliers,
  warehouses,
  defaultSupplierId,
  today,
}: {
  order: PoView | null;
  suppliers: { id: string; name: string }[];
  warehouses: WarehouseView[];
  defaultSupplierId: string;
  today: string;
}): JSX.Element {
  const router = useRouter();
  const active = warehouses.filter((w) => w.isActive);
  const [supplierId, setSupplierId] = useState(order?.supplierId ?? defaultSupplierId);
  const [warehouseId, setWarehouseId] = useState(
    order?.warehouseId ?? active.find((w) => w.isDefault)?.id ?? active[0]?.id ?? '',
  );
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? today);
  const [expectedDate, setExpectedDate] = useState(order?.expectedDate ?? '');
  const [reference, setReference] = useState(order?.supplierReference ?? '');
  const [notes, setNotes] = useState(order?.notes ?? '');
  const [lines, setLines] = useState<Line[]>(
    (order?.lines ?? []).map((l) => ({
      productId: l.productId,
      variantId: l.variantId,
      label: l.variantName ? `${l.productName} - ${l.variantName}` : l.productName,
      quantity: trim(l.quantity),
      unitCost: trim(l.unitCost),
      taxRate: trim(l.taxRate),
    })),
  );
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<z.infer<typeof pickerBody>['data']>([]);
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

  async function search(text: string): Promise<void> {
    setQ(text);
    if (text.trim().length < 2) return setHits([]);
    try {
      const response = await fetch(
        `/api/products/picker?${new URLSearchParams({ q: text.trim(), limit: '10' }).toString()}`,
      );
      const parsed = pickerBody.safeParse(await response.json().catch(() => null));
      setHits(parsed.success ? parsed.data.data : []);
    } catch {
      setHits([]);
    }
  }

  const setLine = (i: number, patch: Partial<Line>): void =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save(): Promise<void> {
    setNote(null);
    if (!supplierId) return setNote({ ok: false, text: t('s08Crm.orders.noSupplier') });
    if (lines.length === 0) return setNote({ ok: false, text: t('s08Crm.orders.needLine') });
    setBusy(true);
    const payload = {
      supplierId,
      warehouseId,
      orderDate,
      expectedDate: expectedDate || null,
      supplierReference: reference,
      notes,
      lines: lines.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        description: '',
        quantity: l.quantity,
        unitCost: l.unitCost || '0',
        taxRate: l.taxRate || '0',
      })),
    };
    try {
      const response = await fetch(
        order ? `/api/purchase-orders/${order.id}` : '/api/purchase-orders',
        {
          method: order ? 'PUT' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            order ? { expectedVersion: order.version, order: payload } : payload,
          ),
        },
      );
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const id = z.object({ data: z.object({ id: z.string() }) }).safeParse(json);
        setNote({ ok: true, text: t('s08Crm.orders.saved') });
        if (!order && id.success) router.replace(`/purchase-orders/${id.data.data.id}`);
        router.refresh();
      } else if (response.status === 409) setNote({ ok: false, text: t('s08Crm.orders.conflict') });
      else {
        const err = errorBody.safeParse(json);
        setNote({
          ok: false,
          text: err.success ? err.data.error.message : t('s08Crm.orders.error'),
        });
      }
    } catch {
      setNote({ ok: false, text: t('s08Crm.orders.error') });
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
          {t('s08Crm.orders.supplier')}
          <NativeSelect value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            <option value="">{t('s08Crm.orders.noSupplier')}</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="text-sm">
          {t('s08Crm.orders.warehouse')}
          <NativeSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {active.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="text-sm">
          {t('s08Crm.orders.orderDate')}
          <Input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            required
          />
        </label>
        <label className="text-sm">
          {t('s08Crm.orders.expectedDate')}
          <Input
            type="date"
            value={expectedDate}
            onChange={(e) => setExpectedDate(e.target.value)}
          />
        </label>
        <label className="text-sm sm:col-span-2">
          {t('s08Crm.orders.supplierReference')}
          <Input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
        </label>
      </div>
      <section className="space-y-sp-8">
        <h2 className="text-lg font-semibold">{t('s08Crm.orders.lines')}</h2>
        <label className="block text-sm">
          {t('s08Crm.orders.searchItem')}
          <Input value={q} maxLength={80} onChange={(e) => void search(e.target.value)} />
        </label>
        {hits.length > 0 ? (
          <ul className="rounded-lg border bg-card text-sm">
            {hits.map((h) => (
              <li key={`${h.id}-${h.variantId ?? ''}`}>
                <button
                  type="button"
                  className="w-full px-sp-12 py-sp-8 text-left hover:bg-muted"
                  onClick={() => {
                    setLines([
                      ...lines,
                      {
                        productId: h.id,
                        variantId: h.variantId,
                        label: h.label,
                        quantity: '1',
                        unitCost: '',
                        taxRate: trim(h.taxRate),
                      },
                    ]);
                    setHits([]);
                    setQ('');
                  }}
                >
                  {h.label}
                  {h.sku ? ` (${h.sku})` : ''}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {lines.map((l, i) => (
          <div
            key={`${l.productId}-${l.variantId ?? ''}-${i}`}
            className="grid gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm sm:grid-cols-5"
          >
            <p className="font-medium sm:col-span-5">{l.label}</p>
            <label>
              {t('s08Crm.orders.quantity')}
              <Input
                inputMode="decimal"
                value={l.quantity}
                maxLength={20}
                onChange={(e) => setLine(i, { quantity: e.target.value })}
              />
            </label>
            <label>
              {t('s08Crm.orders.unitCost')}
              <Input
                inputMode="decimal"
                value={l.unitCost}
                maxLength={20}
                onChange={(e) => setLine(i, { unitCost: e.target.value })}
              />
            </label>
            <label>
              {t('s08Crm.orders.taxRate')}
              <Input
                inputMode="decimal"
                value={l.taxRate}
                maxLength={10}
                onChange={(e) => setLine(i, { taxRate: e.target.value })}
              />
            </label>
            <p className="self-end">
              {t('s08Crm.orders.lineTotal')}:{' '}
              {totals ? formatMoney(Money.parse(totals.lineTotals[i] ?? '0')) : '-'}
            </p>
            <Button
              type="button"
              variant="outline"
              className="self-end"
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
            >
              {t('s08Crm.orders.removeLine')}
            </Button>
          </div>
        ))}
      </section>
      <dl className="grid max-w-sm grid-cols-2 gap-sp-4 text-sm">
        <dt>{t('s08Crm.orders.subtotal')}</dt>
        <dd className="text-right">{totals ? formatMoney(Money.parse(totals.subtotal)) : '-'}</dd>
        <dt>{t('s08Crm.orders.tax')}</dt>
        <dd className="text-right">{totals ? formatMoney(Money.parse(totals.taxTotal)) : '-'}</dd>
        <dt className="font-semibold">{t('s08Crm.orders.orderTotal')}</dt>
        <dd className="text-right font-semibold">
          {totals ? formatMoney(Money.parse(totals.total)) : '-'}
        </dd>
      </dl>
      <label className="block text-sm">
        {t('s08Crm.orders.notes')}
        <Textarea value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {note ? (
        <p role="status" className={note.ok ? 'text-sm' : 'text-sm text-destructive'}>
          {note.text}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {t('s08Crm.orders.saveDraft')}
      </Button>
    </form>
  );
}
