// path: components/inventory/supplier-form.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { COUNTRY_CODES, countryName } from '@/lib/company/countries';
import { t } from '@/lib/i18n';
import type { CustomFieldDef } from '@/services/client/custom-fields';
import type { SupplierView } from '@/services/supplier/suppliers';

const errorBody = z.object({
  error: z.object({
    message: z.string(),
    details: z
      .array(
        z.object({ path: z.string().optional(), message: z.string().optional() }).passthrough(),
      )
      .nullable()
      .optional(),
  }),
});

interface State {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  taxId: string;
  category: string;
  paymentTermsDays: string;
  addressLine1: string;
  addressLine2: string;
  addressCity: string;
  addressRegion: string;
  addressPostalCode: string;
  addressCountry: string;
  notes: string;
  custom: Record<string, string | number | boolean | null>;
}

const initial = (s: SupplierView | null): State => ({
  name: s?.name ?? '',
  contactName: s?.contactName ?? '',
  email: s?.email ?? '',
  phone: s?.phone ?? '',
  website: s?.website ?? '',
  taxId: s?.taxId ?? '',
  category: s?.category ?? '',
  paymentTermsDays:
    s?.paymentTermsDays === null || s?.paymentTermsDays === undefined
      ? ''
      : String(s.paymentTermsDays),
  addressLine1: s?.addressLine1 ?? '',
  addressLine2: s?.addressLine2 ?? '',
  addressCity: s?.addressCity ?? '',
  addressRegion: s?.addressRegion ?? '',
  addressPostalCode: s?.addressPostalCode ?? '',
  addressCountry: s?.addressCountry ?? '',
  notes: s?.notes ?? '',
  custom: s?.customFields ?? {},
});

export function SupplierForm({
  supplier,
  defs,
  categories,
}: {
  supplier: SupplierView | null;
  defs: CustomFieldDef[];
  categories: string[];
}): JSX.Element {
  const router = useRouter();
  const [s, setS] = useState<State>(() => initial(supplier));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(): Promise<void> {
    setBusy(true);
    setMessage(null);
    setErrors({});
    const body = {
      name: s.name,
      contactName: s.contactName,
      email: s.email,
      phone: s.phone,
      website: s.website,
      taxId: s.taxId,
      category: s.category,
      paymentTermsDays:
        s.paymentTermsDays.trim() === '' ? null : Math.trunc(Number(s.paymentTermsDays)),
      addressLine1: s.addressLine1,
      addressLine2: s.addressLine2,
      addressCity: s.addressCity,
      addressRegion: s.addressRegion,
      addressPostalCode: s.addressPostalCode,
      addressCountry: s.addressCountry === '' ? null : s.addressCountry,
      notes: s.notes,
      customFields: s.custom,
    };
    try {
      const response = await fetch(supplier ? `/api/suppliers/${supplier.id}` : '/api/suppliers', {
        method: supplier ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          supplier ? { expectedVersion: supplier.version, supplier: body } : body,
        ),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        setMessage({ ok: true, text: t('s08Crm.suppliers.saved') });
        const id = z.object({ data: z.object({ id: z.string() }) }).safeParse(json);
        if (!supplier && id.success) router.replace(`/suppliers/${id.data.data.id}`);
        router.refresh();
      } else if (response.status === 409)
        setMessage({ ok: false, text: t('s08Crm.suppliers.conflict') });
      else {
        const err = errorBody.safeParse(json);
        const map: Record<string, string> = {};
        for (const d of (err.success ? err.data.error.details : null) ?? [])
          if (typeof d.path === 'string' && typeof d.message === 'string')
            map[d.path.replace(/^supplier\./, '')] = d.message;
        setErrors(map);
        setMessage({ ok: false, text: t('s08Crm.suppliers.error') });
      }
    } catch {
      setMessage({ ok: false, text: t('s08Crm.suppliers.error') });
    }
    setBusy(false);
  }

  const field = (
    id: keyof Omit<State, 'custom'>,
    label: string,
    max: number,
    type = 'text',
  ): JSX.Element => (
    <FormField id={id} label={label} error={errors[id]}>
      {(p) => (
        <Input
          {...p}
          type={type}
          maxLength={max}
          value={s[id]}
          onChange={(e) => setS({ ...s, [id]: e.target.value })}
        />
      )}
    </FormField>
  );

  return (
    <form
      className="space-y-sp-16"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={busy} className="space-y-sp-16">
        <section className="grid gap-sp-12 rounded-lg border bg-card p-sp-16 sm:grid-cols-2">
          <FormField id="name" label={t('s08Crm.suppliers.name')} required error={errors.name}>
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
          {field('contactName', t('s08Crm.suppliers.contactName'), 200)}
          {field('email', t('s08Crm.suppliers.email'), 254, 'email')}
          {field('phone', t('s08Crm.suppliers.phone'), 30, 'tel')}
          {field('website', t('s08Crm.suppliers.website'), 200, 'url')}
          {field('taxId', t('s08Crm.suppliers.taxId'), 40)}
          <FormField id="category" label={t('s08Crm.suppliers.category')} error={errors.category}>
            {(p) => (
              <>
                <Input
                  {...p}
                  list="supplier-categories"
                  maxLength={60}
                  value={s.category}
                  onChange={(e) => setS({ ...s, category: e.target.value })}
                />
                <datalist id="supplier-categories">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </>
            )}
          </FormField>
          <FormField
            id="terms"
            label={t('s08Crm.suppliers.paymentTerms')}
            error={errors.paymentTermsDays}
          >
            {(p) => (
              <Input
                {...p}
                inputMode="numeric"
                maxLength={3}
                value={s.paymentTermsDays}
                onChange={(e) =>
                  setS({ ...s, paymentTermsDays: e.target.value.replace(/\D/g, '') })
                }
              />
            )}
          </FormField>
        </section>
        <section className="grid gap-sp-12 rounded-lg border bg-card p-sp-16 sm:grid-cols-2">
          <h2 className="text-h4 font-semibold sm:col-span-2">{t('s08Crm.suppliers.address')}</h2>
          {field('addressLine1', t('s08Crm.suppliers.line1'), 200)}
          {field('addressLine2', t('s08Crm.suppliers.line2'), 200)}
          {field('addressCity', t('s08Crm.suppliers.city'), 100)}
          {field('addressRegion', t('s08Crm.suppliers.region'), 100)}
          {field('addressPostalCode', t('s08Crm.suppliers.postalCode'), 20)}
          <FormField id="country" label={t('s08Crm.suppliers.country')}>
            {(p) => (
              <NativeSelect
                {...p}
                value={s.addressCountry}
                onChange={(e) => setS({ ...s, addressCountry: e.target.value })}
              >
                <option value="">{t('s08Crm.suppliers.chooseCountry')}</option>
                {COUNTRY_CODES.map((c) => (
                  <option key={c} value={c}>
                    {countryName(c)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </section>
        {defs.length > 0 ? (
          <section className="grid gap-sp-12 rounded-lg border bg-card p-sp-16 sm:grid-cols-2">
            <h2 className="text-h4 font-semibold sm:col-span-2">{t('s08Crm.form.sectionExtra')}</h2>
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
                        type={d.kind === 'number' ? 'number' : d.kind === 'date' ? 'date' : 'text'}
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
          </section>
        ) : null}
        <section className="rounded-lg border bg-card p-sp-16">
          <FormField id="notes" label={t('s08Crm.suppliers.notes')} error={errors.notes}>
            {(p) => (
              <Textarea
                {...p}
                rows={4}
                maxLength={3000}
                value={s.notes}
                onChange={(e) => setS({ ...s, notes: e.target.value })}
              />
            )}
          </FormField>
        </section>
      </fieldset>
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {message.text}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {busy ? t('s08Crm.suppliers.saving') : t('s08Crm.suppliers.save')}
      </Button>
    </form>
  );
}
