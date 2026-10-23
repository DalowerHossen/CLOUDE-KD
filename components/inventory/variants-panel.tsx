// path: components/inventory/variants-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import type { VariantView } from '@/services/product/variants';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

interface Row {
  id: string | null;
  name: string;
  sku: string;
  barcode: string;
  unitPrice: string;
  attribute: string;
  isActive: boolean;
}

const toRow = (v: VariantView): Row => ({
  id: v.id,
  name: v.name,
  sku: v.sku ?? '',
  barcode: v.barcode ?? '',
  unitPrice: v.unitPrice ?? '',
  attribute: Object.entries(v.attributes)
    .map(([k, val]) => `${k}: ${val}`)
    .join(', '),
  isActive: v.isActive,
});

/** "size: M, colour: blue" to an object. Keys are lower-cased and cleaned to letters, digits and underscores. */
function parseAttributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(',')) {
    const [k, ...rest] = part.split(':');
    const key = (k ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const value = rest.join(':').trim();
    if (key && /^[a-z]/.test(key) && value) out[key] = value;
  }
  return out;
}

export function VariantsPanel({
  productId,
  variants,
  canEdit,
}: {
  productId: string;
  variants: VariantView[];
  canEdit: boolean;
}): JSX.Element {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => variants.map(toRow));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch(`/api/products/${productId}/variants`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          variants: rows.map((r) => ({
            id: r.id,
            name: r.name,
            sku: r.sku,
            barcode: r.barcode,
            unitPrice: r.unitPrice.trim() === '' ? null : r.unitPrice.trim(),
            attributes: parseAttributes(r.attribute),
            isActive: r.isActive,
          })),
        }),
      });
      if (response.ok) {
        setNote({ ok: true, text: t('s08Crm.products.saved') });
        router.refresh();
      } else {
        const err = errorBody.safeParse(await response.json().catch(() => null));
        setNote({
          ok: false,
          text: err.success ? err.data.error.message : t('s08Crm.products.error'),
        });
      }
    } catch {
      setNote({ ok: false, text: t('s08Crm.products.error') });
    }
    setBusy(false);
  }

  const set = (i: number, patch: Partial<Row>): void =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <section
      className="space-y-sp-8 rounded-lg border bg-card p-sp-16 text-sm"
      aria-label={t('s08Crm.products.variantsTitle')}
    >
      <h2 className="text-h4 font-semibold">{t('s08Crm.products.variantsTitle')}</h2>
      <p className="text-muted-foreground">{t('s08Crm.products.variantsHelp')}</p>
      {rows.map((r, i) => (
        <div
          key={r.id ?? `new-${i}`}
          className="grid gap-sp-8 rounded-md border p-sp-12 sm:grid-cols-3"
        >
          <label>
            <span className="block">{t('s08Crm.products.variantName')}</span>
            <Input
              value={r.name}
              maxLength={120}
              disabled={!canEdit}
              onChange={(e) => set(i, { name: e.target.value })}
            />
          </label>
          <label>
            <span className="block">{t('s08Crm.products.sku')}</span>
            <Input
              value={r.sku}
              maxLength={40}
              disabled={!canEdit}
              onChange={(e) => set(i, { sku: e.target.value })}
            />
          </label>
          <label>
            <span className="block">{t('s08Crm.products.barcode')}</span>
            <Input
              value={r.barcode}
              maxLength={32}
              disabled={!canEdit}
              onChange={(e) => set(i, { barcode: e.target.value })}
            />
          </label>
          <label>
            <span className="block">{t('s08Crm.products.variantPrice')}</span>
            <Input
              inputMode="decimal"
              value={r.unitPrice}
              maxLength={20}
              disabled={!canEdit}
              onChange={(e) => set(i, { unitPrice: e.target.value })}
            />
          </label>
          <label className="sm:col-span-2">
            <span className="block">{t('s08Crm.products.variantAttribute')}</span>
            <Input
              value={r.attribute}
              maxLength={200}
              disabled={!canEdit}
              onChange={(e) => set(i, { attribute: e.target.value })}
            />
          </label>
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-sp-8 sm:col-span-3">
              <label className="flex items-center gap-sp-8">
                <input
                  type="checkbox"
                  checked={r.isActive}
                  onChange={(e) => set(i, { isActive: e.target.checked })}
                />
                {t('s08Crm.products.statusActive')}
              </label>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                {t('s08Crm.products.removeTier')}
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      {canEdit ? (
        <div className="flex flex-wrap gap-sp-8">
          {rows.length < 50 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setRows([
                  ...rows,
                  {
                    id: null,
                    name: '',
                    sku: '',
                    barcode: '',
                    unitPrice: '',
                    attribute: '',
                    isActive: true,
                  },
                ])
              }
            >
              {t('s08Crm.products.addVariant')}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={busy || rows.some((r) => r.name.trim() === '')}
            onClick={() => void save()}
          >
            {t('s08Crm.products.saveVariants')}
          </Button>
        </div>
      ) : null}
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? '' : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
