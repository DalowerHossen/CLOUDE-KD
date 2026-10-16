// path: components/crm/client-form.tsx
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
import { DISPLAY_CURRENCIES } from '@/lib/company/sections';
import { t } from '@/lib/i18n';
import type { CustomFieldDef } from '@/services/client/custom-fields';
import type { ClientView } from '@/services/client/clients';

const duplicateShape = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  reason: z.enum(['email', 'tax_id', 'name']),
});
const errorBody = z.object({
  error: z.object({
    code: z.string().optional(),
    message: z.string(),
    details: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .nullable()
      .optional(),
  }),
});

type Contact = { name: string; role: string; email: string; phone: string };
interface FormState {
  kind: 'company' | 'person';
  name: string;
  contactName: string;
  email: string;
  billingEmail: string;
  phone: string;
  website: string;
  taxId: string;
  displayCurrency: string;
  paymentTermsDays: string;
  notes: string;
  tags: string;
  billing: {
    line1: string;
    line2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
  shipping: {
    line1: string;
    line2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  };
  openingBalance: string;
  creditLimit: string;
  riskFlag: 'none' | 'watch' | 'high';
  doNotContact: boolean;
  remindersOptOut: boolean;
  notifyByEmail: boolean;
  showStatement: boolean;
  contacts: Contact[];
  custom: Record<string, string | number | boolean | null>;
}

function initial(c: ClientView | null): FormState {
  return {
    kind: c?.kind ?? 'company',
    name: c?.name ?? '',
    contactName: c?.contactName ?? '',
    email: c?.email ?? '',
    billingEmail: c?.billingEmail ?? '',
    phone: c?.phone ?? '',
    website: c?.website ?? '',
    taxId: c?.taxId ?? '',
    displayCurrency: c?.displayCurrency ?? 'USD',
    paymentTermsDays:
      c?.paymentTermsDays === null || c?.paymentTermsDays === undefined
        ? ''
        : String(c.paymentTermsDays),
    notes: c?.notes ?? '',
    tags: (c?.tags ?? []).join(', '),
    billing: {
      line1: c?.billing.line1 ?? '',
      line2: c?.billing.line2 ?? '',
      city: c?.billing.city ?? '',
      region: c?.billing.region ?? '',
      postalCode: c?.billing.postalCode ?? '',
      country: c?.billing.country ?? '',
    },
    shipping: {
      line1: c?.shipping.line1 ?? '',
      line2: c?.shipping.line2 ?? '',
      city: c?.shipping.city ?? '',
      region: c?.shipping.region ?? '',
      postalCode: c?.shipping.postalCode ?? '',
      country: c?.shipping.country ?? '',
    },
    openingBalance: c?.openingBalance ?? '0',
    creditLimit: c?.creditLimit ?? '',
    riskFlag: c?.riskFlag ?? 'none',
    doNotContact: c?.doNotContact ?? false,
    remindersOptOut: c?.remindersOptOut ?? false,
    notifyByEmail: c?.portalPrefs.notifyByEmail ?? true,
    showStatement: c?.portalPrefs.showStatement ?? true,
    contacts: (c?.contacts ?? []).map((x) => ({
      name: x.name,
      role: x.role,
      email: x.email ?? '',
      phone: x.phone,
    })),
    custom: c?.customFields ?? {},
  };
}

function payload(s: FormState): Record<string, unknown> {
  const blank = (v: string): string | null => (v.trim() === '' ? null : v.trim());
  const shippingCountry = blank(s.shipping.country);
  return {
    kind: s.kind,
    name: s.name,
    contactName: s.contactName,
    email: s.email,
    billingEmail: s.billingEmail,
    phone: s.phone,
    website: s.website,
    taxId: s.taxId,
    displayCurrency: s.displayCurrency,
    paymentTermsDays:
      s.paymentTermsDays.trim() === '' ? null : Math.trunc(Number(s.paymentTermsDays)),
    notes: s.notes,
    tags: s.tags
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    customFields: s.custom,
    billing: { ...s.billing, country: s.billing.country },
    shipping: { ...s.shipping, country: shippingCountry },
    openingBalance: s.openingBalance.trim() === '' ? '0' : s.openingBalance.trim(),
    creditLimit: blank(s.creditLimit),
    riskFlag: s.riskFlag,
    doNotContact: s.doNotContact,
    remindersOptOut: s.remindersOptOut,
    portalPrefs: { notifyByEmail: s.notifyByEmail, showStatement: s.showStatement },
    contacts: s.contacts.filter((c) => c.name.trim() !== ''),
  };
}

const countries = COUNTRY_CODES.map((c) => ({ value: c, label: countryName(c) }));

function AddressFields({
  prefix,
  value,
  onChange,
  required,
  errors,
}: {
  prefix: string;
  value: FormState['billing'];
  onChange: (next: FormState['billing']) => void;
  required: boolean;
  errors: Record<string, string>;
}): JSX.Element {
  const set = (k: keyof FormState['billing'], v: string): void => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-sp-12 sm:grid-cols-2">
      <FormField
        id={`${prefix}-line1`}
        label={t('s08Crm.form.line1')}
        error={errors[`${prefix}.line1`]}
      >
        {(p) => (
          <Input
            {...p}
            maxLength={200}
            value={value.line1}
            onChange={(e) => set('line1', e.target.value)}
          />
        )}
      </FormField>
      <FormField
        id={`${prefix}-line2`}
        label={t('s08Crm.form.line2')}
        error={errors[`${prefix}.line2`]}
      >
        {(p) => (
          <Input
            {...p}
            maxLength={200}
            value={value.line2}
            onChange={(e) => set('line2', e.target.value)}
          />
        )}
      </FormField>
      <FormField
        id={`${prefix}-city`}
        label={t('s08Crm.form.city')}
        error={errors[`${prefix}.city`]}
      >
        {(p) => (
          <Input
            {...p}
            maxLength={100}
            value={value.city}
            onChange={(e) => set('city', e.target.value)}
          />
        )}
      </FormField>
      <FormField
        id={`${prefix}-region`}
        label={t('s08Crm.form.region')}
        error={errors[`${prefix}.region`]}
      >
        {(p) => (
          <Input
            {...p}
            maxLength={100}
            value={value.region}
            onChange={(e) => set('region', e.target.value)}
          />
        )}
      </FormField>
      <FormField
        id={`${prefix}-postal`}
        label={t('s08Crm.form.postalCode')}
        required={required}
        error={errors[`${prefix}.postalCode`]}
      >
        {(p) => (
          <Input
            {...p}
            maxLength={20}
            value={value.postalCode}
            onChange={(e) => set('postalCode', e.target.value)}
          />
        )}
      </FormField>
      <FormField
        id={`${prefix}-country`}
        label={t('s08Crm.form.country')}
        required={required}
        error={errors[`${prefix}.country`]}
      >
        {(p) => (
          <NativeSelect
            {...p}
            value={value.country}
            onChange={(e) => set('country', e.target.value)}
          >
            <option value="">{t('s08Crm.form.chooseCountry')}</option>
            {countries.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
    </div>
  );
}

export function ClientForm({
  client,
  defs,
}: {
  client: ClientView | null;
  defs: CustomFieldDef[];
}): JSX.Element {
  const router = useRouter();
  const [s, setS] = useState<FormState>(() => initial(client));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dupes, setDupes] = useState<z.infer<typeof duplicateShape>[] | null>(null);
  const locked = client?.anonymized === true;

  async function submit(confirmDuplicate = false): Promise<void> {
    setBusy(true);
    setMessage(null);
    setErrors({});
    setDupes(null);
    try {
      const body = client
        ? { ...payload(s), expectedVersion: client.version }
        : { ...payload(s), confirmDuplicate };
      const response = await fetch(client ? `/api/clients/${client.id}` : '/api/clients', {
        method: client ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        setMessage({ ok: true, text: t('s08Crm.form.saved') });
        const id = z.object({ data: z.object({ id: z.string() }) }).safeParse(json);
        if (!client && id.success) router.replace(`/clients/${id.data.data.id}`);
        router.refresh();
        setBusy(false);
        return;
      }
      const err = errorBody.safeParse(json);
      const code = err.success ? err.data.error.code : undefined;
      if (response.status === 409 && code === 'duplicate') {
        const list = z.array(duplicateShape).safeParse(err.success ? err.data.error.details : null);
        setDupes(list.success ? list.data : []);
      } else if (response.status === 409)
        setMessage({ ok: false, text: t('s08Crm.form.conflict') });
      else {
        const map: Record<string, string> = {};
        for (const d of (err.success ? err.data.error.details : null) ?? [])
          if (typeof d.path === 'string' && typeof d.message === 'string') map[d.path] = d.message;
        setErrors(map);
        setMessage({
          ok: false,
          text:
            err.success && !err.data.error.details
              ? err.data.error.message
              : t('s08Crm.form.error'),
        });
      }
    } catch {
      setMessage({ ok: false, text: t('s08Crm.form.error') });
    }
    setBusy(false);
  }

  const setContact = (i: number, patch: Partial<Contact>): void =>
    setS({ ...s, contacts: s.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <form
      className="space-y-sp-24"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(false);
      }}
    >
      <fieldset disabled={locked || busy} className="space-y-sp-24">
        <section className="space-y-sp-12 rounded-lg border bg-card p-sp-16">
          <h2 className="text-h4 font-semibold">{t('s08Crm.form.sectionBasics')}</h2>
          <div className="grid gap-sp-12 sm:grid-cols-2">
            <FormField id="kind" label={t('s08Crm.form.kind')}>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={s.kind}
                  onChange={(e) =>
                    setS({ ...s, kind: e.target.value === 'person' ? 'person' : 'company' })
                  }
                >
                  <option value="company">{t('s08Crm.form.kindCompany')}</option>
                  <option value="person">{t('s08Crm.form.kindPerson')}</option>
                </NativeSelect>
              )}
            </FormField>
            <FormField id="name" label={t('s08Crm.form.name')} required error={errors.name}>
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
            <FormField
              id="contactName"
              label={t('s08Crm.form.contactName')}
              error={errors.contactName}
            >
              {(p) => (
                <Input
                  {...p}
                  maxLength={200}
                  value={s.contactName}
                  onChange={(e) => setS({ ...s, contactName: e.target.value })}
                />
              )}
            </FormField>
            <FormField id="email" label={t('s08Crm.form.email')} error={errors.email}>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  maxLength={254}
                  value={s.email}
                  onChange={(e) => setS({ ...s, email: e.target.value })}
                />
              )}
            </FormField>
            <FormField
              id="billingEmail"
              label={t('s08Crm.form.billingEmail')}
              error={errors.billingEmail}
            >
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  maxLength={254}
                  value={s.billingEmail}
                  onChange={(e) => setS({ ...s, billingEmail: e.target.value })}
                />
              )}
            </FormField>
            <FormField id="phone" label={t('s08Crm.form.phone')} error={errors.phone}>
              {(p) => (
                <Input
                  {...p}
                  type="tel"
                  maxLength={30}
                  value={s.phone}
                  onChange={(e) => setS({ ...s, phone: e.target.value })}
                />
              )}
            </FormField>
            <FormField id="website" label={t('s08Crm.form.website')} error={errors.website}>
              {(p) => (
                <Input
                  {...p}
                  type="url"
                  maxLength={200}
                  value={s.website}
                  onChange={(e) => setS({ ...s, website: e.target.value })}
                />
              )}
            </FormField>
            <FormField id="taxId" label={t('s08Crm.form.taxId')} error={errors.taxId}>
              {(p) => (
                <Input
                  {...p}
                  maxLength={40}
                  value={s.taxId}
                  onChange={(e) => setS({ ...s, taxId: e.target.value })}
                />
              )}
            </FormField>
            <FormField
              id="tags"
              label={t('s08Crm.form.tags')}
              error={errors.tags}
              className="sm:col-span-2"
            >
              {(p) => (
                <Input
                  {...p}
                  maxLength={400}
                  value={s.tags}
                  onChange={(e) => setS({ ...s, tags: e.target.value })}
                />
              )}
            </FormField>
          </div>
        </section>

        <section className="space-y-sp-12 rounded-lg border bg-card p-sp-16">
          <h2 className="text-h4 font-semibold">{t('s08Crm.form.sectionContacts')}</h2>
          {s.contacts.map((c, i) => (
            <div key={i} className="grid gap-sp-8 rounded-md border p-sp-12 sm:grid-cols-4">
              <FormField
                id={`c-name-${i}`}
                label={t('s08Crm.form.name')}
                error={errors[`contacts.${i}.name`]}
              >
                {(p) => (
                  <Input
                    {...p}
                    maxLength={200}
                    value={c.name}
                    onChange={(e) => setContact(i, { name: e.target.value })}
                  />
                )}
              </FormField>
              <FormField id={`c-role-${i}`} label={t('s08Crm.form.contactRole')}>
                {(p) => (
                  <Input
                    {...p}
                    maxLength={100}
                    value={c.role}
                    onChange={(e) => setContact(i, { role: e.target.value })}
                  />
                )}
              </FormField>
              <FormField
                id={`c-email-${i}`}
                label={t('s08Crm.form.email')}
                error={errors[`contacts.${i}.email`]}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="email"
                    maxLength={254}
                    value={c.email}
                    onChange={(e) => setContact(i, { email: e.target.value })}
                  />
                )}
              </FormField>
              <FormField
                id={`c-phone-${i}`}
                label={t('s08Crm.form.phone')}
                error={errors[`contacts.${i}.phone`]}
              >
                {(p) => (
                  <Input
                    {...p}
                    type="tel"
                    maxLength={30}
                    value={c.phone}
                    onChange={(e) => setContact(i, { phone: e.target.value })}
                  />
                )}
              </FormField>
              <div className="sm:col-span-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setS({ ...s, contacts: s.contacts.filter((_, j) => j !== i) })}
                >
                  {t('s08Crm.form.removeContact')}
                </Button>
              </div>
            </div>
          ))}
          {s.contacts.length < 10 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setS({
                  ...s,
                  contacts: [...s.contacts, { name: '', role: '', email: '', phone: '' }],
                })
              }
            >
              {t('s08Crm.form.addContact')}
            </Button>
          ) : null}
        </section>

        <section className="space-y-sp-12 rounded-lg border bg-card p-sp-16">
          <h2 className="text-h4 font-semibold">{t('s08Crm.form.sectionBilling')}</h2>
          <p className="text-sm text-muted-foreground">{t('s08Crm.form.billingHelp')}</p>
          <AddressFields
            prefix="billing"
            required
            value={s.billing}
            onChange={(billing) => setS({ ...s, billing })}
            errors={errors}
          />
        </section>

        <section className="space-y-sp-12 rounded-lg border bg-card p-sp-16">
          <h2 className="text-h4 font-semibold">{t('s08Crm.form.sectionShipping')}</h2>
          <AddressFields
            prefix="shipping"
            required={false}
            value={s.shipping}
            onChange={(shipping) => setS({ ...s, shipping })}
            errors={errors}
          />
        </section>

        <section className="space-y-sp-12 rounded-lg border bg-card p-sp-16">
          <h2 className="text-h4 font-semibold">{t('s08Crm.form.sectionTerms')}</h2>
          <div className="grid gap-sp-12 sm:grid-cols-2">
            <FormField id="displayCurrency" label={t('s08Crm.form.displayCurrency')}>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={s.displayCurrency}
                  onChange={(e) => setS({ ...s, displayCurrency: e.target.value })}
                >
                  {DISPLAY_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField
              id="terms"
              label={t('s08Crm.form.paymentTerms')}
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
            <FormField
              id="opening"
              label={t('s08Crm.form.openingBalance')}
              error={errors.openingBalance}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  maxLength={20}
                  value={s.openingBalance}
                  onChange={(e) => setS({ ...s, openingBalance: e.target.value })}
                />
              )}
            </FormField>
            <FormField
              id="creditLimit"
              label={t('s08Crm.form.creditLimit')}
              error={errors.creditLimit}
            >
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  maxLength={20}
                  value={s.creditLimit}
                  onChange={(e) => setS({ ...s, creditLimit: e.target.value })}
                />
              )}
            </FormField>
            <FormField id="risk" label={t('s08Crm.form.riskFlag')}>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={s.riskFlag}
                  onChange={(e) =>
                    setS({
                      ...s,
                      riskFlag:
                        e.target.value === 'high'
                          ? 'high'
                          : e.target.value === 'watch'
                            ? 'watch'
                            : 'none',
                    })
                  }
                >
                  <option value="none">{t('s08Crm.form.riskNone')}</option>
                  <option value="watch">{t('s08Crm.form.riskWatch')}</option>
                  <option value="high">{t('s08Crm.form.riskHigh')}</option>
                </NativeSelect>
              )}
            </FormField>
          </div>
        </section>

        <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16 text-sm">
          <h2 className="text-h4 font-semibold">{t('s08Crm.form.sectionFlags')}</h2>
          {(
            [
              ['doNotContact', t('s08Crm.form.doNotContact')],
              ['remindersOptOut', t('s08Crm.form.remindersOptOut')],
              ['notifyByEmail', t('s08Crm.form.portalNotify')],
              ['showStatement', t('s08Crm.form.portalStatement')],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-sp-8">
              <input
                type="checkbox"
                checked={s[key]}
                onChange={(e) => setS({ ...s, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
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

        <section className="rounded-lg border bg-card p-sp-16">
          <FormField id="notes" label={t('s08Crm.form.notes')} error={errors.notes}>
            {(p) => (
              <Textarea
                {...p}
                rows={5}
                maxLength={5000}
                value={s.notes}
                onChange={(e) => setS({ ...s, notes: e.target.value })}
              />
            )}
          </FormField>
        </section>
      </fieldset>

      {dupes ? (
        <section
          role="alert"
          className="space-y-sp-8 rounded-lg border border-destructive p-sp-16 text-sm"
        >
          <h2 className="font-semibold">{t('s08Crm.duplicate.title')}</h2>
          <p>{t('s08Crm.duplicate.help')}</p>
          <ul className="space-y-1">
            {dupes.map((d) => (
              <li key={d.id}>
                <a className="underline" href={`/clients/${d.id}`} target="_blank" rel="noreferrer">
                  {d.name}
                </a>{' '}
                {d.email ?? ''} -{' '}
                {d.reason === 'email'
                  ? t('s08Crm.duplicate.reasonEmail')
                  : d.reason === 'tax_id'
                    ? t('s08Crm.duplicate.reasonTax')
                    : t('s08Crm.duplicate.reasonName')}
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void submit(true)}>
            {t('s08Crm.duplicate.createAnyway')}
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
      {locked ? null : (
        <Button type="submit" disabled={busy}>
          {busy ? t('s08Crm.form.saving') : t('s08Crm.form.save')}
        </Button>
      )}
    </form>
  );
}
