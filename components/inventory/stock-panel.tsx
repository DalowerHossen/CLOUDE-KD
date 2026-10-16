// path: components/inventory/stock-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { ADJUST_REASONS } from '@/lib/stock/stock';
import { t, type StringKey } from '@/lib/i18n';
import type { LevelRow } from '@/services/inventory/stock';
import type { WarehouseView } from '@/services/inventory/warehouses';
import type { VariantView } from '@/services/product/variants';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

async function send(url: string, method: 'POST' | 'PUT', body: unknown): Promise<string | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) return null;
    const err = errorBody.safeParse(await response.json().catch(() => null));
    return err.success ? err.data.error.message : t('s08Crm.inventory.error');
  } catch {
    return t('s08Crm.inventory.error');
  }
}

/** Stock of one product by warehouse and variant, with the correction, transfer and reorder level forms. */
export function StockPanel({
  productId,
  tracked,
  levels,
  warehouses,
  variants,
  reorderLevel,
  canAdjust,
  canTransfer,
}: {
  productId: string;
  tracked: boolean;
  levels: LevelRow[];
  warehouses: WarehouseView[];
  variants: VariantView[];
  reorderLevel: string | null;
  canAdjust: boolean;
  canTransfer: boolean;
}): JSX.Element {
  const router = useRouter();
  const active = warehouses.filter((w) => w.isActive);
  const [mode, setMode] = useState<'set' | 'change'>('set');
  const [variantId, setVariantId] = useState('');
  const [warehouseId, setWarehouseId] = useState(
    active.find((w) => w.isDefault)?.id ?? active[0]?.id ?? '',
  );
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState<(typeof ADJUST_REASONS)[number]>('correction');
  const [note, setNote] = useState('');
  const [toWarehouse, setToWarehouse] = useState('');
  const [moveQty, setMoveQty] = useState('');
  const [reorder, setReorder] = useState(reorderLevel ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(fn: () => Promise<string | null>, reset: () => void): Promise<void> {
    setBusy(true);
    setMessage(null);
    const error = await fn();
    setBusy(false);
    if (error) setMessage({ ok: false, text: error });
    else {
      reset();
      setMessage({ ok: true, text: t('s08Crm.inventory.done') });
      router.refresh();
    }
  }

  if (!tracked)
    return (
      <section className="rounded-lg border bg-card p-sp-16 text-sm text-muted-foreground">
        {t('s08Crm.inventory.notTracked')}
      </section>
    );

  const stateLabel = (s: LevelRow['state']): string =>
    t(
      `s08Crm.inventory.${s === 'ok' ? 'stateOk' : s === 'low' ? 'stateLow' : 'stateOut'}` as StringKey,
    );

  return (
    <section
      className="space-y-sp-12 rounded-lg border bg-card p-sp-16 text-sm"
      aria-label={t('s08Crm.inventory.stockTitle')}
    >
      <h2 className="text-h4 font-semibold">{t('s08Crm.inventory.stockTitle')}</h2>
      <p className="text-muted-foreground">{t('s08Crm.inventory.stockHelp')}</p>
      {levels.length === 0 ? (
        <p className="text-muted-foreground">{t('s08Crm.inventory.noStock')}</p>
      ) : (
        <ul className="divide-y">
          {levels.map((l) => (
            <li
              key={`${l.warehouseId}-${l.variantId ?? 'x'}`}
              className="flex flex-wrap items-center justify-between gap-sp-8 py-1"
            >
              <span>
                {l.warehouseName}
                {l.variantName ? ` - ${l.variantName}` : ''}
              </span>
              <span className="flex items-center gap-sp-8">
                <strong>{l.quantity.replace(/0+$/, '').replace(/\.$/, '')}</strong>
                <Badge variant="outline">{stateLabel(l.state)}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}

      {canAdjust ? (
        <form
          className="space-y-sp-8 rounded-md border p-sp-12"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                send('/api/inventory/adjust', 'POST', {
                  mode,
                  productId,
                  variantId: variantId || null,
                  warehouseId,
                  quantity,
                  reason,
                  note,
                }),
              () => {
                setQuantity('');
                setNote('');
              },
            );
          }}
        >
          <h3 className="font-medium">{t('s08Crm.inventory.adjustTitle')}</h3>
          <div className="grid gap-sp-8 sm:grid-cols-2">
            <label>
              <span className="block">{t('s08Crm.inventory.mode')}</span>
              <NativeSelect
                value={mode}
                onChange={(e) => setMode(e.target.value === 'change' ? 'change' : 'set')}
              >
                <option value="set">{t('s08Crm.inventory.modeSet')}</option>
                <option value="change">{t('s08Crm.inventory.modeChange')}</option>
              </NativeSelect>
            </label>
            <label>
              <span className="block">{t('s08Crm.inventory.warehouse')}</span>
              <NativeSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                {active.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            {variants.length > 0 ? (
              <label>
                <span className="block">{t('s08Crm.inventory.variant')}</span>
                <NativeSelect value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                  <option value="">-</option>
                  {variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ) : null}
            <label>
              <span className="block">{t('s08Crm.inventory.amount')}</span>
              <Input
                inputMode="decimal"
                value={quantity}
                maxLength={20}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <label>
              <span className="block">{t('s08Crm.inventory.adjustReason')}</span>
              <NativeSelect
                value={reason}
                onChange={(e) =>
                  setReason(ADJUST_REASONS.find((r) => r === e.target.value) ?? 'correction')
                }
              >
                {ADJUST_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`s08Crm.inventory.reasons.${r}` as StringKey)}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <p className="text-muted-foreground">{t('s08Crm.inventory.amountHelp')}</p>
          <label className="block">
            <span className="block">{t('s08Crm.inventory.adjustNote')}</span>
            <Textarea
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy || quantity.trim() === '' || warehouseId === ''}>
            {t('s08Crm.inventory.adjust')}
          </Button>
        </form>
      ) : null}

      {canTransfer && active.length > 1 ? (
        <form
          className="space-y-sp-8 rounded-md border p-sp-12"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                send('/api/inventory/transfer', 'POST', {
                  productId,
                  variantId: variantId || null,
                  fromWarehouseId: warehouseId,
                  toWarehouseId: toWarehouse,
                  quantity: moveQty,
                  note: '',
                }),
              () => setMoveQty(''),
            );
          }}
        >
          <h3 className="font-medium">{t('s08Crm.inventory.transferTitle')}</h3>
          <div className="grid gap-sp-8 sm:grid-cols-3">
            <label>
              <span className="block">{t('s08Crm.inventory.from')}</span>
              <NativeSelect value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                {active.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label>
              <span className="block">{t('s08Crm.inventory.to')}</span>
              <NativeSelect value={toWarehouse} onChange={(e) => setToWarehouse(e.target.value)}>
                <option value="">-</option>
                {active
                  .filter((w) => w.id !== warehouseId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </NativeSelect>
            </label>
            <label>
              <span className="block">{t('s08Crm.inventory.amount')}</span>
              <Input
                inputMode="decimal"
                value={moveQty}
                maxLength={20}
                onChange={(e) => setMoveQty(e.target.value)}
              />
            </label>
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={busy || toWarehouse === '' || moveQty.trim() === ''}
          >
            {t('s08Crm.inventory.transfer')}
          </Button>
        </form>
      ) : null}

      {canAdjust ? (
        <form
          className="flex flex-wrap items-end gap-sp-8"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                send('/api/inventory/reorder', 'PUT', {
                  productId,
                  reorderLevel: reorder.trim() === '' ? null : reorder.trim(),
                }),
              () => undefined,
            );
          }}
        >
          <label>
            <span className="block">{t('s08Crm.inventory.reorderLabel')}</span>
            <Input
              inputMode="decimal"
              value={reorder}
              maxLength={20}
              onChange={(e) => setReorder(e.target.value)}
            />
          </label>
          <Button type="submit" variant="outline" disabled={busy}>
            {t('s08Crm.inventory.saveReorder')}
          </Button>
        </form>
      ) : null}
      {message ? (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? '' : 'text-destructive'}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
