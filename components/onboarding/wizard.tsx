// path: components/onboarding/wizard.tsx
'use client';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { Confetti } from '@/components/shared/confetti';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { COUNTRY_CODES, countryName } from '@/lib/company/countries';
import { INDUSTRY_LIST } from '@/lib/company/presets';
import { DUE_DAYS, FONT_KEYS, previewNumber, type Industry } from '@/lib/company/sections';
import { t } from '@/lib/i18n';
import type { OnboardingView } from '@/services/company/onboarding';
import { ChecklistCard } from './checklist-card';
import { LogoUpload } from './logo-upload';

const TOTAL = 5;
const errorBody = z.object({
  error: z.object({ message: z.string(), code: z.string().optional() }),
});
const FONT_CLASS: Record<(typeof FONT_KEYS)[number], string> = {
  system: 'font-sans',
  inter: 'font-sans tracking-tight',
  serif: 'font-serif',
  mono: 'font-mono',
};

function timezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf(
      'timeZone',
    );
  } catch {
    return ['UTC'];
  }
}

export function Wizard({ initial }: { initial: OnboardingView }): JSX.Element {
  const [view, setView] = useState(initial);
  const [step, setStep] = useState(Math.min(TOTAL, Math.max(1, initial.state.step)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const zones = useMemo(() => timezones(), []);
  const p = view.profile;
  const [company, setCompany] = useState({
    legalName: p.legalName,
    tradingName: p.tradingName,
    industry: (p.industry ?? 'service') as Industry,
    phone: p.phone,
    addressLine1: p.addressLine1,
    city: p.city,
    region: p.region,
    postalCode: p.postalCode,
    country: p.country,
    timezone:
      p.timezone === 'UTC' && typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        : p.timezone,
  });
  const [brand, setBrand] = useState({
    primaryColor: view.branding.primaryColor,
    accentColor: view.branding.accentColor,
    fontKey: view.branding.fontKey,
  });
  const [invoice, setInvoice] = useState({
    invoicePrefix: view.invoice.invoicePrefix,
    numbering: view.invoice.numbering,
    dueDays: view.invoice.dueDays,
    terms: view.invoice.terms,
    notes: view.invoice.notes,
    usePreset: false,
  });
  const [logoSet, setLogoSet] = useState(view.branding.logoFileId !== null);
  const status = view.state.status;

  async function send(body: unknown): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/companies/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const parsed = z.object({ data: z.unknown() }).safeParse(json);
        if (parsed.success) setView(parsed.data.data as OnboardingView);
        return true;
      }
      const err = errorBody.safeParse(json);
      setMessage(
        err.success && err.data.error.code === 'conflict'
          ? t('s07Company.onboarding.conflict')
          : err.success
            ? err.data.error.message
            : t('s07Company.onboarding.error'),
      );
    } catch {
      setMessage(t('s07Company.onboarding.error'));
    } finally {
      setBusy(false);
    }
    return false;
  }

  async function next(body: Record<string, unknown>): Promise<void> {
    if (await send({ step, ...body })) {
      if (step === TOTAL) setCelebrate(true);
      else setStep(step + 1);
    }
  }

  const labels = [
    t('s07Company.onboarding.steps.company'),
    t('s07Company.onboarding.steps.logo'),
    t('s07Company.onboarding.steps.brand'),
    t('s07Company.onboarding.steps.invoicing'),
    t('s07Company.onboarding.steps.payments'),
  ];

  if (status === 'completed' || status === 'skipped') {
    return (
      <div className="space-y-sp-16">
        {celebrate ? <Confetti /> : null}
        <section className="space-y-2 rounded-lg border bg-card p-sp-16">
          <h2 className="text-h3 font-semibold">
            {status === 'completed'
              ? t('s07Company.onboarding.done.title')
              : t('s07Company.onboarding.done.skipped')}
          </h2>
          {status === 'completed' ? <p>{t('s07Company.onboarding.done.text')}</p> : null}
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void send({ action: 'resume' }).then((ok) => ok && setStep(1))}
          >
            {t('s07Company.onboarding.done.resume')}
          </Button>
        </section>
        <ChecklistCard items={view.checklist} percent={view.percent} />
      </div>
    );
  }

  const field = 'block space-y-1 text-sm';
  return (
    <div className="space-y-sp-16">
      <div>
        <p className="text-sm font-medium">
          {t('s07Company.onboarding.stepOf', { step, total: TOTAL })} - {labels[step - 1]}
        </p>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL}
          aria-valuenow={step}
          aria-label={t('s07Company.onboarding.progress')}
          className="mt-2 flex gap-1"
        >
          {labels.map((l, i) => (
            <span
              key={l}
              className={`h-2 flex-1 rounded-full ${i < step ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>
      </div>

      {step === 1 ? (
        <form
          className="space-y-sp-12"
          onSubmit={(e) => {
            e.preventDefault();
            void next({ ...company });
          }}
        >
          <h2 className="text-h3 font-semibold">{t('s07Company.onboarding.company.title')}</h2>
          <label className={field}>
            <span>{t('s07Company.onboarding.company.legalName')}</span>
            <Input
              required
              maxLength={200}
              value={company.legalName}
              onChange={(e) => setCompany({ ...company, legalName: e.target.value })}
            />
          </label>
          <label className={field}>
            <span>{t('s07Company.onboarding.company.tradingName')}</span>
            <Input
              maxLength={200}
              value={company.tradingName}
              onChange={(e) => setCompany({ ...company, tradingName: e.target.value })}
            />
          </label>
          <fieldset className="space-y-2">
            <legend className="text-sm">{t('s07Company.onboarding.company.industry')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {INDUSTRY_LIST.map((i) => (
                <label
                  key={i.key}
                  className={`flex cursor-pointer gap-2 rounded-lg border p-sp-12 text-sm ${company.industry === i.key ? 'border-primary bg-primary/5' : ''}`}
                >
                  <input
                    type="radio"
                    name="industry"
                    value={i.key}
                    checked={company.industry === i.key}
                    onChange={() => setCompany({ ...company, industry: i.key })}
                    className="mt-1"
                  />
                  <span>
                    <strong>{i.label}</strong>
                    <span className="block text-muted-foreground">{i.summary}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className={field}>
            <span>{t('s07Company.onboarding.company.phone')}</span>
            <Input
              type="tel"
              maxLength={30}
              value={company.phone}
              onChange={(e) => setCompany({ ...company, phone: e.target.value })}
            />
          </label>
          <label className={field}>
            <span>{t('s07Company.onboarding.company.address')}</span>
            <Input
              maxLength={200}
              value={company.addressLine1}
              onChange={(e) => setCompany({ ...company, addressLine1: e.target.value })}
            />
          </label>
          <div className="grid gap-sp-12 sm:grid-cols-3">
            <label className={field}>
              <span>{t('s07Company.onboarding.company.city')}</span>
              <Input
                maxLength={100}
                value={company.city}
                onChange={(e) => setCompany({ ...company, city: e.target.value })}
              />
            </label>
            <label className={field}>
              <span>{t('s07Company.onboarding.company.region')}</span>
              <Input
                maxLength={100}
                value={company.region}
                onChange={(e) => setCompany({ ...company, region: e.target.value })}
              />
            </label>
            <label className={field}>
              <span>{t('s07Company.onboarding.company.postalCode')}</span>
              <Input
                maxLength={20}
                value={company.postalCode}
                onChange={(e) => setCompany({ ...company, postalCode: e.target.value })}
              />
            </label>
          </div>
          <label className={field}>
            <span>{t('s07Company.onboarding.company.country')}</span>
            <NativeSelect
              required
              value={company.country}
              onChange={(e) => setCompany({ ...company, country: e.target.value })}
            >
              <option value="">{t('s07Company.onboarding.company.chooseCountry')}</option>
              {COUNTRY_CODES.map((c) => (
                <option key={c} value={c}>
                  {countryName(c)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className={field}>
            <span>{t('s07Company.onboarding.company.timezone')}</span>
            <NativeSelect
              value={company.timezone}
              onChange={(e) => setCompany({ ...company, timezone: e.target.value })}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
              {!zones.includes(company.timezone) ? (
                <option value={company.timezone}>{company.timezone}</option>
              ) : null}
            </NativeSelect>
          </label>
          <Nav busy={busy} first />
        </form>
      ) : null}

      {step === 2 ? (
        <div className="space-y-sp-12">
          <h2 className="text-h3 font-semibold">{t('s07Company.onboarding.logo.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('s07Company.onboarding.logo.help')}</p>
          <LogoUpload hasLogo={logoSet} onUploaded={() => setLogoSet(true)} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              {t('s07Company.onboarding.back')}
            </Button>
            <Button type="button" disabled={busy} onClick={() => void next({})}>
              {logoSet ? t('s07Company.onboarding.next') : t('s07Company.onboarding.skipLogo')}
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <form
          className="space-y-sp-12"
          onSubmit={(e) => {
            e.preventDefault();
            void next({ ...brand });
          }}
        >
          <h2 className="text-h3 font-semibold">{t('s07Company.onboarding.brand.title')}</h2>
          <div className="grid gap-sp-12 sm:grid-cols-3">
            <label className={field}>
              <span>{t('s07Company.onboarding.brand.primary')}</span>
              <Input
                type="color"
                value={brand.primaryColor}
                onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })}
                className="h-11 p-1"
              />
            </label>
            <label className={field}>
              <span>{t('s07Company.onboarding.brand.accent')}</span>
              <Input
                type="color"
                value={brand.accentColor}
                onChange={(e) => setBrand({ ...brand, accentColor: e.target.value })}
                className="h-11 p-1"
              />
            </label>
            <label className={field}>
              <span>{t('s07Company.onboarding.brand.font')}</span>
              <NativeSelect
                value={brand.fontKey}
                onChange={(e) =>
                  setBrand({ ...brand, fontKey: e.target.value as (typeof FONT_KEYS)[number] })
                }
              >
                {FONT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t(`s07Company.onboarding.brand.fonts.${k}`)}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <div
            aria-label={t('s07Company.onboarding.brand.preview')}
            className={`rounded-lg border bg-white p-sp-16 text-black ${FONT_CLASS[brand.fontKey]}`}
          >
            <p className="text-lg font-bold" style={{ color: brand.primaryColor }}>
              {company.legalName || t('s07Company.onboarding.brand.sample')}
            </p>
            <p
              className="mt-1 inline-block rounded px-2 py-1 text-sm text-white"
              style={{ backgroundColor: brand.accentColor }}
            >
              {t('s07Company.onboarding.brand.sample')}
            </p>
          </div>
          <Nav busy={busy} onBack={() => setStep(2)} />
        </form>
      ) : null}

      {step === 4 ? (
        <form
          className="space-y-sp-12"
          onSubmit={(e) => {
            e.preventDefault();
            void next({ ...invoice });
          }}
        >
          <h2 className="text-h3 font-semibold">{t('s07Company.onboarding.invoicing.title')}</h2>
          <div className="grid gap-sp-12 sm:grid-cols-2">
            <label className={field}>
              <span>{t('s07Company.onboarding.invoicing.prefix')}</span>
              <Input
                maxLength={10}
                value={invoice.invoicePrefix}
                onChange={(e) =>
                  setInvoice({ ...invoice, invoicePrefix: e.target.value.toUpperCase() })
                }
              />
            </label>
            <label className={field}>
              <span>{t('s07Company.onboarding.invoicing.numbering')}</span>
              <NativeSelect
                value={invoice.numbering}
                onChange={(e) =>
                  setInvoice({ ...invoice, numbering: e.target.value as 'sequential' | 'yearly' })
                }
              >
                <option value="sequential">
                  {t('s07Company.onboarding.invoicing.sequential')}
                </option>
                <option value="yearly">{t('s07Company.onboarding.invoicing.yearly')}</option>
              </NativeSelect>
            </label>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('s07Company.onboarding.invoicing.next', {
              number: previewNumber({ ...view.invoice, ...invoice }),
            })}
          </p>
          <label className={field}>
            <span>{t('s07Company.onboarding.invoicing.dueDays')}</span>
            <NativeSelect
              value={String(invoice.dueDays)}
              onChange={(e) => setInvoice({ ...invoice, dueDays: Number(e.target.value) })}
            >
              {DUE_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d === 0
                    ? t('s07Company.onboarding.invoicing.dueNow')
                    : t('s07Company.onboarding.invoicing.due', { days: d })}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className={field}>
            <span>{t('s07Company.onboarding.invoicing.terms')}</span>
            <Textarea
              rows={3}
              maxLength={2000}
              value={invoice.terms}
              onChange={(e) => setInvoice({ ...invoice, terms: e.target.value })}
            />
          </label>
          <label className={field}>
            <span>{t('s07Company.onboarding.invoicing.notes')}</span>
            <Textarea
              rows={3}
              maxLength={2000}
              value={invoice.notes}
              onChange={(e) => setInvoice({ ...invoice, notes: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={invoice.usePreset}
              onCheckedChange={(v) => setInvoice({ ...invoice, usePreset: v === true })}
            />
            <span>{t('s07Company.onboarding.invoicing.usePreset')}</span>
          </label>
          <Nav busy={busy} onBack={() => setStep(3)} />
        </form>
      ) : null}

      {step === 5 ? (
        <div className="space-y-sp-12">
          <h2 className="text-h3 font-semibold">{t('s07Company.onboarding.payments.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('s07Company.onboarding.payments.text')}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setStep(4)}>
              {t('s07Company.onboarding.back')}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void next({ paymentsSkipped: true })}
            >
              {t('s07Company.onboarding.payments.finish')}
            </Button>
          </div>
        </div>
      ) : null}

      <p aria-live="polite" className="text-sm text-destructive">
        {message}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => void send({ action: 'skip' })}
      >
        {t('s07Company.onboarding.skipAll')}
      </Button>
    </div>
  );
}

function Nav({
  busy,
  first,
  onBack,
}: {
  busy: boolean;
  first?: boolean;
  onBack?: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {first ? null : (
        <Button type="button" variant="outline" onClick={onBack}>
          {t('s07Company.onboarding.back')}
        </Button>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? t('s07Company.onboarding.saving') : t('s07Company.onboarding.next')}
      </Button>
    </div>
  );
}
