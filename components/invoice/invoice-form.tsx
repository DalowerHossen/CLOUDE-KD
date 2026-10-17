// path: components/invoice/invoice-form.tsx
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { DISPLAY_CURRENCIES } from '@/lib/company/sections';
import { t, type StringKey } from '@/lib/i18n';
import {
  blankLine,
  lineFromItem,
  previewTotals,
  termsFromDays,
  EMPTY_BLOCK,
  type PickerItemLike,
} from '@/lib/invoice/form';
import { INVOICE_KINDS, MAX_LINES, type InvoiceInput } from '@/lib/invoice/input';
import { PAYMENT_TERMS, dueDateFor, type PaymentTerms } from '@/lib/invoice/terms';
import { AddressFields } from './address-fields';
import { callJson } from './api-call';
import { LineEditor } from './line-editor';
import { TotalsPanel } from './totals-panel';

const AUTOSAVE_MS = 30_000;

const clientSearchBody = z.object({
  data: z.object({ rows: z.array(z.object({ id: z.string(), name: z.string() })) }),
});
const clientBody = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    contactName: z.string(),
    email: z.string().nullable(),
    billingEmail: z.string().nullable(),
    phone: z.string(),
    taxId: z.string(),
    paymentTermsDays: z.number().nullable(),
    billing: z.object({
      line1: z.string(),
      line2: z.string(),
      city: z.string(),
      region: z.string(),
      postalCode: z.string(),
      country: z.string().nullable(),
    }),
    shipping: z.object({
      line1: z.string(),
      line2: z.string(),
      city: z.string(),
      region: z.string(),
      postalCode: z.string(),
      country: z.string().nullable(),
    }),
  }),
});
const pickerBody = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      variantId: z.string().nullable(),
      label: z.string(),
      sku: z.string().nullable(),
      unit: z.string(),
      unitPrice: z.string(),
    }),
  ),
});

export interface FormRate {
  code: string;
  name: string;
  rate: string;
  compound: boolean;
  isActive: boolean;
}

/** The part of a saved document the form needs: an invoice and an estimate both have these. */
export interface FormDoc {
  id: string;
  version: number;
  status: string;
}

/** Where the form saves. An estimate uses the same form; its "due date" is the date it is valid until. */
export interface FormTarget {
  apiBase: string;
  pageBase: string;
  estimate: boolean;
}

const INVOICE_TARGET: FormTarget = {
  apiBase: '/api/invoices',
  pageBase: '/invoices',
  estimate: false,
};

export function InvoiceForm({
  invoice,
  target = INVOICE_TARGET,
  initial,
  rates,
  fxRates,
  defaultTaxCodes,
  clientName,
  readOnly = false,
}: {
  readOnly?: boolean;
  invoice: FormDoc | null;
  target?: FormTarget;
  initial: InvoiceInput;
  rates: FormRate[];
  fxRates: { currency: string; rate: string }[];
  defaultTaxCodes: string[];
  clientName: string;
}): JSX.Element {
  const router = useRouter();
  const locked = readOnly || (invoice !== null && invoice.status !== 'draft');
  const [input, setInput] = useState<InvoiceInput>(initial);
  const [chosenClient, setChosenClient] = useState(clientName);
  const [walkIn, setWalkIn] = useState(initial.clientId === null && initial.walkInName !== '');
  const [shipSame, setShipSame] = useState(initial.shipTo === null);
  const [tagsText, setTagsText] = useState(initial.tags.join(', '));
  const [version, setVersion] = useState(invoice?.version ?? 0);
  const [clientHits, setClientHits] = useState<{ id: string; name: string }[] | null>(null);
  const [itemHits, setItemHits] = useState<z.infer<typeof pickerBody>['data']>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const key = useRef(crypto.randomUUID());
  const latest = useRef({ input, version, dirty, busy });
  useEffect(() => {
    latest.current = { input, version, dirty, busy };
  });

  const activeRates = rates.filter((r) => r.isActive);
  const preview = useMemo(() => previewTotals(input, rates), [input, rates]);
  const fxRate = fxRates.find((f) => f.currency === input.displayCurrency)?.rate ?? null;

  const update = (patch: Partial<InvoiceInput>): void => {
    setInput((cur) => ({ ...cur, ...patch }));
    setDirty(true);
  };
  const updateOptions = (patch: Partial<InvoiceInput['options']>): void =>
    update({ options: { ...input.options, ...patch } });

  function body(): InvoiceInput {
    return {
      ...input,
      shipTo: shipSame ? null : (input.shipTo ?? EMPTY_BLOCK),
      tags: tagsText
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x !== ''),
      clientId: walkIn ? null : input.clientId,
      walkInName: walkIn ? input.walkInName : '',
    };
  }

  async function save(autosave: boolean): Promise<void> {
    if (locked) return;
    if (!autosave) {
      if (!walkIn && !input.clientId)
        return setNote({ ok: false, text: t('s09Invoicing.invoices.needClient') });
      if (walkIn && input.walkInName.trim() === '' && input.billTo.name.trim() === '')
        return setNote({ ok: false, text: t('s09Invoicing.invoices.needClient') });
      setBusy(true);
      setNote(null);
    }
    const payload = body();
    const result = invoice
      ? await callJson(`${target.apiBase}/${invoice.id}`, 'PUT', {
          expectedVersion: latest.current.version,
          autosave,
          invoice: payload,
        })
      : await callJson(target.apiBase, 'POST', payload, { 'idempotency-key': key.current });
    if (result.ok) {
      const saved = z.object({ id: z.string(), version: z.number() }).safeParse(result.data);
      if (saved.success) setVersion(saved.data.version);
      setDirty(false);
      if (autosave)
        setNote({
          ok: true,
          text: t('s09Invoicing.invoices.autosaved', { time: new Date().toLocaleTimeString() }),
        });
      else {
        setNote({ ok: true, text: t('s09Invoicing.invoices.saved') });
        if (!invoice && saved.success) router.replace(`${target.pageBase}/${saved.data.id}`);
        router.refresh();
      }
    } else if (result.status === 409) {
      setNote({ ok: false, text: t('s09Invoicing.invoices.conflict') });
    } else if (!autosave || result.message) {
      setNote({ ok: false, text: result.message ?? t('s09Invoicing.invoices.error') });
    }
    if (!autosave) setBusy(false);
  }

  // Automatic save every 30 seconds while there are unsaved changes in an existing draft.
  useEffect(() => {
    if (!invoice || locked) return undefined;
    const timer = setInterval(() => {
      const cur = latest.current;
      if (cur.dirty && !cur.busy) void save(true);
    }, AUTOSAVE_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, locked]);

  async function searchClients(text: string): Promise<void> {
    if (text.trim().length < 2) return setClientHits(null);
    const r = await fetch(
      `/api/clients?${new URLSearchParams({ q: text.trim() }).toString()}`,
    ).catch(() => null);
    const parsed = clientSearchBody.safeParse(await r?.json().catch(() => null));
    setClientHits(parsed.success ? parsed.data.data.rows.slice(0, 8) : []);
  }

  async function pickClient(id: string): Promise<void> {
    const r = await fetch(`/api/clients/${id}`).catch(() => null);
    const parsed = clientBody.safeParse(await r?.json().catch(() => null));
    if (!parsed.success) return;
    const c = parsed.data.data;
    const terms = termsFromDays(c.paymentTermsDays);
    setChosenClient(c.name);
    setClientHits(null);
    setWalkIn(false);
    update({
      clientId: c.id,
      walkInName: '',
      billTo: {
        ...EMPTY_BLOCK,
        name: c.name,
        contactName: c.contactName,
        email: c.billingEmail ?? c.email ?? '',
        phone: c.phone,
        taxId: c.taxId,
        line1: c.billing.line1,
        line2: c.billing.line2,
        city: c.billing.city,
        region: c.billing.region,
        postalCode: c.billing.postalCode,
        country: c.billing.country,
      },
      shipTo: c.shipping.line1 ? { ...EMPTY_BLOCK, name: c.name, ...c.shipping } : null,
      paymentTerms: terms,
      dueDate: target.estimate ? input.dueDate : dueDateFor(input.issueDate, terms, null),
    });
    setShipSame(!c.shipping.line1);
  }

  async function searchItems(text: string): Promise<void> {
    if (text.trim().length < 2) return setItemHits([]);
    const clientQuery: Record<string, string> = input.clientId ? { clientId: input.clientId } : {};
    const r = await fetch(
      `/api/products/picker?${new URLSearchParams({ q: text.trim(), limit: '10', ...clientQuery }).toString()}`,
    ).catch(() => null);
    const parsed = pickerBody.safeParse(await r?.json().catch(() => null));
    setItemHits(parsed.success ? parsed.data.data : []);
  }

  function addItem(item: PickerItemLike): void {
    if (input.lines.length >= MAX_LINES) return;
    update({ lines: [...input.lines, lineFromItem(item, defaultTaxCodes)] });
    setItemHits([]);
  }

  function setTerms(terms: PaymentTerms): void {
    update({
      paymentTerms: terms,
      dueDate: target.estimate
        ? input.dueDate
        : dueDateFor(input.issueDate, terms, terms === 'custom' ? input.dueDate : null),
    });
  }

  return (
    <form
      className="space-y-sp-24"
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
    >
      <fieldset disabled={locked} className="space-y-sp-24">
        <section className="grid gap-sp-12 text-sm sm:grid-cols-3">
          <label className={target.estimate ? 'hidden' : undefined}>
            {t('s09Invoicing.invoices.type')}
            <NativeSelect
              value={input.kind}
              disabled={invoice !== null}
              onChange={(e) =>
                update({ kind: INVOICE_KINDS.find((k) => k === e.target.value) ?? 'invoice' })
              }
            >
              {INVOICE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`s09Invoicing.invoices.kinds.${k}` as StringKey)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            {t('s09Invoicing.invoices.poNumber')}
            <Input
              maxLength={60}
              value={input.poNumber}
              onChange={(e) => update({ poNumber: e.target.value })}
            />
          </label>
          <label>
            {t('s09Invoicing.invoices.category')}
            <Input
              maxLength={60}
              value={input.category}
              onChange={(e) => update({ category: e.target.value })}
            />
          </label>
        </section>

        <section className="space-y-sp-8">
          <h2 className="text-lg font-semibold">{t('s09Invoicing.invoices.clientSection')}</h2>
          <label className="flex items-center gap-sp-8 text-sm">
            <input
              type="checkbox"
              checked={walkIn}
              onChange={(e) => {
                setWalkIn(e.target.checked);
                setDirty(true);
              }}
            />
            {t('s09Invoicing.invoices.walkIn')}
          </label>
          {walkIn ? (
            <label className="block text-sm">
              {t('s09Invoicing.invoices.walkInName')}
              <Input
                maxLength={200}
                value={input.walkInName}
                onChange={(e) => update({ walkInName: e.target.value })}
              />
            </label>
          ) : (
            <div className="space-y-sp-8 text-sm">
              {input.clientId ? (
                <p>
                  {t('s09Invoicing.invoices.clientChosen', { name: chosenClient })}{' '}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => update({ clientId: null })}
                  >
                    {t('s09Invoicing.invoices.changeClient')}
                  </button>
                </p>
              ) : (
                <>
                  <label className="block">
                    <span className="sr-only">{t('s09Invoicing.invoices.chooseClient')}</span>
                    <Input
                      maxLength={80}
                      placeholder={t('s09Invoicing.invoices.chooseClient')}
                      onChange={(e) => void searchClients(e.target.value)}
                    />
                  </label>
                  {clientHits === null ? null : clientHits.length === 0 ? (
                    <p>{t('s09Invoicing.invoices.clientNone')}</p>
                  ) : (
                    <ul className="divide-y rounded-lg border bg-card">
                      {clientHits.map((h) => (
                        <li key={h.id}>
                          <button
                            type="button"
                            className="w-full p-sp-8 text-left hover:bg-muted"
                            onClick={() => void pickClient(h.id)}
                          >
                            {h.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
          <div className="grid gap-sp-16 lg:grid-cols-2">
            <div className="space-y-sp-8">
              <h3 className="font-medium">{t('s09Invoicing.invoices.billTo')}</h3>
              <AddressFields
                value={input.billTo}
                withTax
                disabled={locked}
                onChange={(billTo) => update({ billTo })}
              />
            </div>
            <div className="space-y-sp-8">
              <h3 className="font-medium">{t('s09Invoicing.invoices.shipTo')}</h3>
              <label className="flex items-center gap-sp-8 text-sm">
                <input
                  type="checkbox"
                  checked={shipSame}
                  onChange={(e) => {
                    setShipSame(e.target.checked);
                    setDirty(true);
                  }}
                />
                {t('s09Invoicing.invoices.sameAsBilling')}
              </label>
              {shipSame ? null : (
                <AddressFields
                  value={input.shipTo ?? EMPTY_BLOCK}
                  withTax={false}
                  disabled={locked}
                  onChange={(shipTo) => update({ shipTo })}
                />
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-sp-12 text-sm sm:grid-cols-4">
          <h2 className="text-lg font-semibold sm:col-span-4">
            {t('s09Invoicing.invoices.dates')}
          </h2>
          <label>
            {t('s09Invoicing.invoices.issueDate')}
            <Input
              type="date"
              required
              value={input.issueDate}
              onChange={(e) =>
                update({
                  issueDate: e.target.value,
                  dueDate: target.estimate
                    ? input.dueDate
                    : dueDateFor(e.target.value, input.paymentTerms, input.dueDate),
                })
              }
            />
          </label>
          <label className={target.estimate ? 'hidden' : undefined}>
            {t('s09Invoicing.invoices.terms')}
            <NativeSelect
              value={input.paymentTerms}
              onChange={(e) =>
                setTerms(PAYMENT_TERMS.find((p) => p === e.target.value) ?? 'net_30')
              }
            >
              {PAYMENT_TERMS.map((p) => (
                <option key={p} value={p}>
                  {t(`s09Invoicing.invoices.termsValues.${p}` as StringKey)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            {target.estimate ? t('s09Estimates.validUntil') : t('s09Invoicing.invoices.dueDate')}
            <Input
              type="date"
              required
              disabled={!target.estimate && input.paymentTerms !== 'custom'}
              value={input.dueDate}
              onChange={(e) => update({ dueDate: e.target.value })}
            />
          </label>
          <label>
            {t('s09Invoicing.invoices.displayCurrency')}
            <NativeSelect
              value={input.displayCurrency ?? ''}
              onChange={(e) =>
                update({
                  displayCurrency: (DISPLAY_CURRENCIES.find(
                    (c) => c === e.target.value && c !== 'USD',
                  ) ?? null) as InvoiceInput['displayCurrency'],
                })
              }
            >
              <option value="">{t('s09Invoicing.invoices.noDisplayCurrency')}</option>
              {fxRates.map((f) => (
                <option key={f.currency} value={f.currency}>
                  {f.currency}
                </option>
              ))}
            </NativeSelect>
          </label>
        </section>

        <section className="space-y-sp-8">
          <h2 className="text-lg font-semibold">{t('s09Invoicing.invoices.lines')}</h2>
          {locked ? null : (
            <div className="space-y-sp-8 text-sm">
              <label className="block">
                <span className="sr-only">{t('s09Invoicing.invoices.searchItem')}</span>
                <Input
                  maxLength={80}
                  placeholder={t('s09Invoicing.invoices.searchItem')}
                  onChange={(e) => void searchItems(e.target.value)}
                />
              </label>
              {itemHits.length > 0 ? (
                <ul className="divide-y rounded-lg border bg-card">
                  {itemHits.map((h) => (
                    <li key={`${h.id}-${h.variantId ?? ''}`}>
                      <button
                        type="button"
                        className="w-full p-sp-8 text-left hover:bg-muted"
                        onClick={() => addItem(h)}
                      >
                        {h.label}
                        {h.sku ? ` (${h.sku})` : ''}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => update({ lines: [...input.lines, blankLine(defaultTaxCodes)] })}
              >
                {t('s09Invoicing.invoices.addBlankLine')}
              </Button>
            </div>
          )}
          <LineEditor
            lines={input.lines}
            results={preview.result?.lines ?? null}
            taxCodes={activeRates}
            disabled={locked}
            onChange={(lines) => update({ lines })}
          />
        </section>

        <section className="grid gap-sp-12 text-sm sm:grid-cols-3">
          <h2 className="text-lg font-semibold sm:col-span-3">
            {t('s09Invoicing.invoices.calculation')}
          </h2>
          <label>
            {t('s09Invoicing.invoices.documentDiscount')}
            <span className="flex gap-sp-4">
              <NativeSelect
                value={input.options.documentDiscountKind}
                onChange={(e) =>
                  updateOptions({
                    documentDiscountKind:
                      e.target.value === 'percent'
                        ? 'percent'
                        : e.target.value === 'fixed'
                          ? 'fixed'
                          : 'none',
                  })
                }
              >
                <option value="none">{t('s09Invoicing.invoices.discountNone')}</option>
                <option value="percent">{t('s09Invoicing.invoices.discountPercent')}</option>
                <option value="fixed">{t('s09Invoicing.invoices.discountFixed')}</option>
              </NativeSelect>
              <Input
                inputMode="decimal"
                maxLength={20}
                disabled={input.options.documentDiscountKind === 'none'}
                value={input.options.documentDiscountValue}
                onChange={(e) => updateOptions({ documentDiscountValue: e.target.value })}
              />
            </span>
          </label>
          <label>
            {t('s09Invoicing.invoices.shipping')}
            <Input
              inputMode="decimal"
              maxLength={20}
              value={input.options.shippingAmount}
              onChange={(e) => updateOptions({ shippingAmount: e.target.value })}
            />
            <span className="mt-sp-4 flex items-center gap-sp-4">
              <input
                type="checkbox"
                checked={input.options.shippingTaxable}
                onChange={(e) => updateOptions({ shippingTaxable: e.target.checked })}
              />
              {t('s09Invoicing.invoices.shippingTaxable')}
            </span>
          </label>
          <label>
            {t('s09Invoicing.invoices.withholding')}
            <Input
              inputMode="decimal"
              maxLength={9}
              value={input.options.withholdingRate}
              onChange={(e) => updateOptions({ withholdingRate: e.target.value })}
            />
          </label>
        </section>

        {preview.result ? (
          <TotalsPanel
            result={preview.result}
            displayCurrency={input.displayCurrency}
            fxRate={fxRate}
          />
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {t('s09Invoicing.invoices.error')}
          </p>
        )}

        <section className="grid gap-sp-12 text-sm sm:grid-cols-2">
          <label className="sm:col-span-2">
            {t('s09Invoicing.invoices.notes')}
            <Textarea
              maxLength={20000}
              value={input.notes}
              onChange={(e) => update({ notes: e.target.value })}
            />
          </label>
          <label className="sm:col-span-2">
            {t('s09Invoicing.invoices.internalNotes')}
            <Textarea
              maxLength={20000}
              value={input.internalNotes}
              onChange={(e) => update({ internalNotes: e.target.value })}
            />
          </label>
          <label>
            {t('s09Invoicing.invoices.tags')}
            <Input
              maxLength={200}
              value={tagsText}
              onChange={(e) => {
                setTagsText(e.target.value);
                setDirty(true);
              }}
            />
          </label>
          <div className="grid grid-cols-2 gap-sp-8">
            <label>
              {t('s09Invoicing.invoices.paper')}
              <NativeSelect
                value={input.paperSize}
                onChange={(e) => update({ paperSize: e.target.value === 'a4' ? 'a4' : 'letter' })}
              >
                <option value="letter">{t('s09Invoicing.invoices.paperLetter')}</option>
                <option value="a4">{t('s09Invoicing.invoices.paperA4')}</option>
              </NativeSelect>
            </label>
            <label>
              {t('s09Invoicing.invoices.template')}
              <NativeSelect
                value={input.template}
                onChange={(e) =>
                  update({
                    template:
                      e.target.value === 'modern'
                        ? 'modern'
                        : e.target.value === 'minimal'
                          ? 'minimal'
                          : e.target.value === 'detailed'
                            ? 'detailed'
                            : 'classic',
                  })
                }
              >
                {(['classic', 'modern', 'minimal', 'detailed'] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`s09Invoicing.invoices.templates.${k}` as StringKey)}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
        </section>
      </fieldset>

      {locked ? (
        invoice?.status === 'draft' ? null : (
          <p className="text-sm text-muted-foreground">
            {invoice?.status === 'pending_approval'
              ? t('s09Invoicing.invoices.waitingLocked')
              : t('s09Invoicing.invoices.sentLocked')}
          </p>
        )
      ) : (
        <div className="flex items-center gap-sp-12">
          <Button type="submit" disabled={busy}>
            {busy ? t('s09Invoicing.invoices.saving') : t('s09Invoicing.invoices.save')}
          </Button>
          {dirty ? <span className="text-sm text-muted-foreground">*</span> : null}
        </div>
      )}
      {note ? (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {note.text}
        </p>
      ) : null}
    </form>
  );
}
