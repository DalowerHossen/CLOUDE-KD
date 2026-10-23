// path: components/inventory/product-form.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { UNIT_SUGGESTIONS } from '@/lib/catalog/products';
import { marginPercent } from '@/lib/catalog/resolve';
import { t } from '@/lib/i18n';
import type { CustomFieldDef } from '@/services/client/custom-fields';
import type { CategoryView } from '@/services/product/categories';
import type { ProductView } from '@/services/product/products';

const duplicateShape = z.object({
  id: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  reason: z.enum(['sku', 'barcode', 'name']),
});
const errorBody = z.object({
  error: z.object({
    code: z.string().optional(),
    message: z.string(),
    details: z
      .array(
        z.object({ path: z.string().optional(), message: z.string().optional() }).passthrough(),
      )
      .nullable()
      .optional(),
  }),
});

type Kind = 'product' | 'service' | 'bundle';
interface State {
  kind: Kind;
  name: string;
  description: string;
  sku: string;
  barcode: string;
  unit: string;
  unitPrice: string;
  costPrice: string;
  taxCategory: 'standard' | 'reduced' | 'zero' | 'exempt';
  taxRate: string;
  categoryId: string;
  hsCode: string;
  trackInventory: boolean;
  valuationMethod: 'average' | 'fifo' | 'lifo';
  status: 'active' | 'inactive' | 'archived';
  volumeTiers: { minQty: string; unitPrice: string }[];
  bundleItems: { productId: string; quantity: string }[];
  custom: Record<string, string | number | boolean | null>;
}

const TAX = ['standard', 'reduced', 'zero', 'exempt'] as const;
const taxLabel = (v: (typeof TAX)[number]): string =>
  v === 'standard'
    ? t('s08Crm.products.taxStandard')
    : v === 'reduced'
      ? t('s08Crm.products.taxReduced')
      : v === 'zero'
        ? t('s08Crm.products.taxZero')
        : t('s08Crm.products.taxExempt');

function initial(p: ProductView | null, kind: Kind): State {
  return {
    kind: p?.kind ?? kind,
    name: p?.name ?? '',
    description: p?.description ?? '',
    sku: p?.sku ?? '',
    barcode: p?.barcode ?? '',
    unit: p?.unit ?? (kind === 'service' ? 'hour' : 'unit'),
    unitPrice: p?.unitPrice ?? '0',
    costPrice: p?.costPrice ?? '0',
    taxCategory: (p?.taxCategory as State['taxCategory'] | undefined) ?? 'standard',
    taxRate: p?.taxRate ?? '0',
    categoryId: p?.categoryId ?? '',
    hsCode: p?.hsCode ?? '',
    trackInventory: p?.trackInventory ?? false,
    valuationMethod: p?.valuationMethod ?? 'average',
    status: p?.status ?? 'active',
    volumeTiers: p?.volumeTiers ?? [],
    bundleItems: (p?.bundleItems ?? []).map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    })),
    custom: p?.customFields ?? {},
  };
}

function payload(s: State): Record<string, unknown> {
  return {
    kind: s.kind,
    name: s.name,
    description: s.description,
    sku: s.sku,
    barcode: s.barcode,
    unit: s.unit,
    unitPrice: s.unitPrice.trim() === '' ? '0' : s.unitPrice.trim(),
    costPrice: s.costPrice.trim() === '' ? '0' : s.costPrice.trim(),
    taxCategory: s.taxCategory,
    taxRate: s.taxRate.trim() === '' ? '0' : s.taxRate.trim(),
    categoryId: s.categoryId === '' ? null : s.categoryId,
    hsCode: s.hsCode,
    trackInventory: s.kind === 'product' ? s.trackInventory : false,
    valuationMethod: s.valuationMethod,
    status: s.status,
    customFields: s.custom,
    volumeTiers: s.volumeTiers,
    bundleItems: s.kind === 'bundle' ? s.bundleItems : [],
  };
}

export function ProductForm({
  product,
  kind,
  categories,
  defs,
  candidates,
}: {
  product: ProductView | null;
  kind: Kind;
  categories: CategoryView[];
  defs: CustomFieldDef[];
  /** Products and services that can go into a bundle. */
  candidates: { id: string; name: string }[];
}): JSX.Element {
  const router = useRouter();
  const [s, setS] = useState<State>(() => initial(product, kind));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dupes, setDupes] = useState<z.infer<typeof duplicateShape>[] | null>(null);

  async function submit(confirmDuplicate = false): Promise<void> {
    setBusy(true);
    setMessage(null);
    setErrors({});
    setDupes(null);
    try {
      const body = product
        ? { expectedVersion: product.version, product: payload(s) }
        : { product: payload(s), confirmDuplicate };
      const response = await fetch(product ? `/api/products/${product.id}` : '/api/products', {
        method: product ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        setMessage({ ok: true, text: t('s08Crm.products.saved') });
        const id = z.object({ data: z.object({ id: z.string() }) }).safeParse(json);
        if (!product && id.success) router.replace(`/products/${id.data.data.id}`);
        router.refresh();
        setBusy(false);
        return;
      }
      const err = errorBody.safeParse(json);
      const code = err.success ? err.data.error.code : undefined;
      if (response.status === 409 && code === 'duplicate') {
        const list = z.array(duplicateShape).safeParse(err.success ? err.data.error.details : null);
        if (list.success) setDupes(list.data);
        else
          setMessage({
            ok: false,
            text: err.success ? err.data.error.message : t('s08Crm.products.error'),
          });
      } else if (response.status === 409)
        setMessage({ ok: false, text: t('s08Crm.products.conflict') });
      else {
        const map: Record<string, string> = {};
        for (const d of (err.success ? err.data.error.details : null) ?? [])
          if (typeof d.path === 'string' && typeof d.message === 'string')
            map[d.path.replace(/^product\./, '')] = d.message;
        setErrors(map);
        setMessage({
          ok: false,
          text:
            err.success && !err.data.error.details
              ? err.data.error.message
              : t('s08Crm.products.error'),
        });
      }
    } catch {
      setMessage({ ok: false, text: t('s08Crm.products.error') });
    }
    setBusy(false);
  }

  let margin: string | null = null;
  try {
    margin = marginPercent(s.unitPrice || '0', s.costPrice || '0');
  } catch {
    margin = null;
  }

  return (
    <form
      className="space-y-sp-24"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <fieldset disabled={busy} className="space-y-sp-24">
        <section className="space-y-sp-12 rounded-lg border bg-card p-sp-16">
          <div className="grid gap-sp-12 sm:grid-cols-2">
            <FormField
              id="kind"
              label={t('s08Crm.products.kind')}
              description={product ? t('s08Crm.products.kindLocked') : undefined}
            >
              {(p) => (
                <NativeSelect
                  {...p}
                  value={s.kind}
                  disabled={product !== null}
                  onChange={(e) =>
                    setS({
                      ...s,
                      kind:
                        e.target.value === 'service'
                          ? 'service'
                          : e.target.value === 'bundle'
                            ? 'bundle'
                            : 'product',
                      trackInventory: false,
                    })
                  }
                >
                  <option value="product">{t('s08Crm.products.kindProduct')}</option>
                  <option value="service">{t('s08Crm.products.kindService')}</option>
                  <option value="bundle">{t('s08Crm.products.kindBundle')}</option>
                </NativeSelect>
              )}
            </FormField>
            <FormField id="name" label={t('s08Crm.products.name')} required error={errors.name}>
              {(p) => (
                <Input
                  {...p}
                  required
                  maxLength={200}
                  value={s.name}
                  onChange={(e) => setS({ ...s, name: e.target.value })}
                />
              )}
            </FormField>
            <FormField id="sku" label={t('s08Crm.products.sku')} error={errors.sku}>
              {(p) => (
                <Input
                  {...p}
                  maxLength={40}
                  value={s.sku}
                  onChange={(e) => setS({ ...s, sku: e.target.value })}
                />
              )}
            </FormField>
            <FormField id="barcode" label={t('s08Crm.products.barcode')} error={errors.barcode}>
              {(p) => (
                <Input
                  {...p}
                  maxLength={32}
                  value={s.barcode}
                  onChange={(e) => setS({ ...s, barcode: e.target.value })}
                />
              )}
            </FormField>
            <FormField
              id="unit"
              label={t('s08Crm.products.unit')}
              description={t('s08Crm.products.unitHelp')}
              error={errors.unit}
            >
              {(p) => (
                <>
                  <Input
                    {...p}
                    list="unit-suggestions"
                    maxLength={20}
                    value={s.unit}
                    onChange={(e) => setS({ ...s, unit: e.target.value })}
                  />
                  <datalist id="unit-suggestions">
                    {UNIT_SUGGESTIONS.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </>
              )}
            </FormField>
            <FormField id="category" label={t('s08Crm.products.category')}>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={s.categoryId}
                  onChange={(e) => setS({ ...s, categoryId: e.target.value })}
                >
                  <option value="">-</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField
              id="unitPrice"
              label={t('s08Crm.products.price')}
              required
              error={errors.unitPrice}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  maxLength={20}
                  value={s.unitPrice}
                  onChange={(e) => setS({ ...s, unitPrice: e.target.value })}
                />
              )}
            </FormField>
            <FormField
              id="costPrice"
              label={t('s08Crm.products.costPrice')}
              description={
                margin !== null
                  ? `${t('s08Crm.products.margin')}: ${margin.replace(/0+$/, '').replace(/\.$/, '')}%`
                  : undefined
              }
              error={errors.costPrice}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  maxLength={20}
                  value={s.costPrice}
                  onChange={(e) => setS({ ...s, costPrice: e.target.value })}
                />
              )}
            </FormField>
            <FormField id="taxCategory" label={t('s08Crm.products.taxCategory')}>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={s.taxCategory}
                  onChange={(e) =>
                    setS({ ...s, taxCategory: TAX.find((x) => x === e.target.value) ?? 'standard' })
                  }
                >
                  {TAX.map((x) => (
                    <option key={x} value={x}>
                      {taxLabel(x)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField id="taxRate" label={t('s08Crm.products.taxRate')} error={errors.taxRate}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  maxLength={10}
                  value={s.taxRate}
                  onChange={(e) => setS({ ...s, taxRate: e.target.value })}
                />
              )}
            </FormField>
            <FormField id="hs" label={t('s08Crm.products.hsCode')} error={errors.hsCode}>
              {(p) => (
                <Input
                  {...p}
                  maxLength={20}
                  value={s.hsCode}
                  onChange={(e) => setS({ ...s, hsCode: e.target.value })}
                />
              )}
            </FormField>
            <FormField id="status" label={t('s08Crm.products.status')}>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={s.status}
                  onChange={(e) =>
                    setS({
                      ...s,
                      status:
                        e.target.value === 'inactive'
                          ? 'inactive'
                          : e.target.value === 'archived'
                            ? 'archived'
                            : 'active',
                    })
                  }
                >
                  <option value="active">{t('s08Crm.products.statusActive')}</option>
                  <option value="inactive">{t('s08Crm.products.statusInactive')}</option>
                  <option value="archived">{t('s08Crm.products.statusArchived')}</option>
                </NativeSelect>
              )}
            </FormField>
          </div>
          <FormField
            id="description"
            label={t('s08Crm.products.description2')}
            error={errors.description}
          >
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                maxLength={2000}
                value={s.description}
                onChange={(e) => setS({ ...s, description: e.target.value })}
              />
            )}
          </FormField>
          {s.kind === 'product' ? (
            <label className="flex items-center gap-sp-8 text-sm">
              <input
                type="checkbox"
                checked={s.trackInventory}
                onChange={(e) => setS({ ...s, trackInventory: e.target.checked })}
              />
              {t('s08Crm.products.trackInventory')}
            </label>
          ) : null}
          {s.kind === 'product' && s.trackInventory ? (
            <FormField
              id="valuation"
              label={t('s08Crm.products.valuationMethod')}
              description={t('s08Crm.products.valuationHelp')}
            >
              {(p) => (
                <NativeSelect
                  {...p}
                  value={s.valuationMethod}
                  onChange={(e) =>
                    setS({
                      ...s,
                      valuationMethod:
                        e.target.value === 'fifo'
                          ? 'fifo'
                          : e.target.value === 'lifo'
                            ? 'lifo'
                            : 'average',
                    })
                  }
                >
                  <option value="average">{t('s08Crm.products.valuationAverage')}</option>
                  <option value="fifo">{t('s08Crm.products.valuationFifo')}</option>
                  <option value="lifo">{t('s08Crm.products.valuationLifo')}</option>
                </NativeSelect>
              )}
            </FormField>
          ) : null}
        </section>

        {s.kind === 'bundle' ? (
          <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16 text-sm">
            <h2 className="text-h4 font-semibold">{t('s08Crm.products.bundleTitle')}</h2>
            <p className="text-muted-foreground">{t('s08Crm.products.bundleHelp')}</p>
            {errors.bundleItems ? (
              <p role="alert" className="text-destructive">
                {errors.bundleItems}
              </p>
            ) : null}
            {s.bundleItems.map((it, i) => (
              <div key={i} className="grid gap-sp-8 sm:grid-cols-3">
                <label className="sm:col-span-2">
                  <span className="block">{t('s08Crm.products.bundleItem')}</span>
                  <NativeSelect
                    value={it.productId}
                    onChange={(e) =>
                      setS({
                        ...s,
                        bundleItems: s.bundleItems.map((x, j) =>
                          j === i ? { ...x, productId: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    <option value="">-</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label>
                  <span className="block">{t('s08Crm.products.bundleQty')}</span>
                  <Input
                    inputMode="decimal"
                    value={it.quantity}
                    onChange={(e) =>
                      setS({
                        ...s,
                        bundleItems: s.bundleItems.map((x, j) =>
                          j === i ? { ...x, quantity: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setS({ ...s, bundleItems: s.bundleItems.filter((_, j) => j !== i) })
                  }
                >
                  {t('s08Crm.products.removeTier')}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setS({ ...s, bundleItems: [...s.bundleItems, { productId: '', quantity: '1' }] })
              }
            >
              {t('s08Crm.products.addBundleItem')}
            </Button>
          </section>
        ) : null}

        <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16 text-sm">
          <h2 className="text-h4 font-semibold">{t('s08Crm.products.tiersTitle')}</h2>
          <p className="text-muted-foreground">{t('s08Crm.products.tiersHelp')}</p>
          {errors.volumeTiers ? (
            <p role="alert" className="text-destructive">
              {errors.volumeTiers}
            </p>
          ) : null}
          {s.volumeTiers.map((tier, i) => (
            <div key={i} className="grid gap-sp-8 sm:grid-cols-3">
              <label>
                <span className="block">{t('s08Crm.products.tierQty')}</span>
                <Input
                  inputMode="decimal"
                  value={tier.minQty}
                  onChange={(e) =>
                    setS({
                      ...s,
                      volumeTiers: s.volumeTiers.map((x, j) =>
                        j === i ? { ...x, minQty: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label>
                <span className="block">{t('s08Crm.products.tierPrice')}</span>
                <Input
                  inputMode="decimal"
                  value={tier.unitPrice}
                  onChange={(e) =>
                    setS({
                      ...s,
                      volumeTiers: s.volumeTiers.map((x, j) =>
                        j === i ? { ...x, unitPrice: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <Button
                type="button"
                variant="outline"
                className="self-end"
                onClick={() => setS({ ...s, volumeTiers: s.volumeTiers.filter((_, j) => j !== i) })}
              >
                {t('s08Crm.products.removeTier')}
              </Button>
            </div>
          ))}
          {s.volumeTiers.length < 10 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setS({
                  ...s,
                  volumeTiers: [...s.volumeTiers, { minQty: '10', unitPrice: s.unitPrice }],
                })
              }
            >
              {t('s08Crm.products.addTier')}
            </Button>
          ) : null}
        </section>

        {defs.length > 0 ? (
          <section className="space-y-sp-12 rounded-lg border bg-card p-sp-16">
            <h2 className="text-h4 font-semibold">{t('s08Crm.form.sectionExtra')}</h2>
            <div className="grid gap-sp-12 sm:grid-cols-2">
              {defs.map((d) => {
                const v = s.custom[d.key];
                const set = (next: string | number | boolean | null): void =>
                  setS({ ...s, custom: { ...s.custom, [d.key]: next } });
                return (
                  <FormField
                    key={d.key}
                    id={`cf-${d.key}`}
                    label={d.label}
                    required={d.required}
                    error={errors[`customFields.${d.key}`]}
                  >
                    {(p) =>
                      d.kind === 'select' ? (
                        <NativeSelect
                          {...p}
                          value={typeof v === 'string' ? v : ''}
                          onChange={(e) => set(e.target.value === '' ? null : e.target.value)}
                        >
                          <option value="">{t('s08Crm.form.choose')}</option>
                          {d.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </NativeSelect>
                      ) : d.kind === 'bool' ? (
                        <NativeSelect
                          {...p}
                          value={v === true ? 'yes' : v === false ? 'no' : ''}
                          onChange={(e) =>
                            set(e.target.value === '' ? null : e.target.value === 'yes')
                          }
                        >
                          <option value="">{t('s08Crm.form.choose')}</option>
                          <option value="yes">{t('s08Crm.form.yes')}</option>
                          <option value="no">{t('s08Crm.form.no')}</option>
                        </NativeSelect>
                      ) : (
                        <Input
                          {...p}
                          type={
                            d.kind === 'number' ? 'number' : d.kind === 'date' ? 'date' : 'text'
                          }
                          maxLength={500}
                          value={v === null || v === undefined ? '' : String(v)}
                          onChange={(e) =>
                            set(
                              e.target.value === ''
                                ? null
                                : d.kind === 'number'
                                  ? Number(e.target.value)
                                  : e.target.value,
                            )
                          }
                        />
                      )
                    }
                  </FormField>
                );
              })}
            </div>
          </section>
        ) : null}
      </fieldset>

      {dupes ? (
        <section
          role="alert"
          className="space-y-sp-8 rounded-lg border border-destructive p-sp-16 text-sm"
        >
          <h2 className="font-semibold">{t('s08Crm.products.duplicateTitle')}</h2>
          <p>{t('s08Crm.products.duplicateHelp')}</p>
          <ul className="space-y-1">
            {dupes.map((d) => (
              <li key={d.id}>
                <a
                  className="underline"
                  href={`/products/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {d.name}
                </a>{' '}
                {d.sku ?? ''} -{' '}
                {d.reason === 'sku'
                  ? t('s08Crm.products.duplicateSku')
                  : d.reason === 'barcode'
                    ? t('s08Crm.products.duplicateBarcode')
                    : t('s08Crm.products.duplicateName')}
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void submit(true)}>
            {t('s08Crm.products.createAnyway')}
          </Button>
        </section>
      ) : null}
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {message.text}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? t('s08Crm.products.saving') : t('s08Crm.products.save')}
      </Button>
    </form>
  );
}
