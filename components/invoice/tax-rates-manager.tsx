// path: components/invoice/tax-rates-manager.tsx
'use client';
import { clampInt } from '@/lib/reports/numbers';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';
import { TAX_KINDS, type TaxRateInput } from '@/lib/tax/input';
import type { TaxTemplate } from '@/lib/tax/templates';
import type { TaxRateView } from '@/services/tax/rates';
import { callJson } from './api-call';

const blank: TaxRateInput = {
  code: '',
  name: '',
  rate: '',
  kind: 'sales',
  country: null,
  region: '',
  compound: false,
  isActive: true,
  sortOrder: 0,
};

export function TaxRatesManager({
  rates,
  templates,
  canManage,
}: {
  rates: TaxRateView[];
  templates: readonly TaxTemplate[];
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [editing, setEditing] = useState<TaxRateView | null>(null);
  const [form, setForm] = useState<TaxRateInput>(blank);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  function edit(r: TaxRateView | null): void {
    setEditing(r);
    setNote(null);
    setForm(
      r
        ? {
            code: r.code,
            name: r.name,
            rate: r.rate.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''),
            kind: r.kind,
            country: r.country,
            region: r.region,
            compound: r.compound,
            isActive: r.isActive,
            sortOrder: r.sortOrder,
          }
        : blank,
    );
  }

  async function save(): Promise<void> {
    setBusy(true);
    setNote(null);
    const result = editing
      ? await callJson(`/api/invoices/tax/rates/${editing.id}`, 'PUT', {
          expectedVersion: editing.version,
          rate: form,
        })
      : await callJson('/api/invoices/tax/rates', 'POST', form);
    if (result.ok) {
      setNote({ ok: true, text: t('s09Invoicing.tax.saved') });
      edit(null);
      router.refresh();
    } else
      setNote({
        ok: false,
        text:
          result.status === 409
            ? t('s09Invoicing.tax.conflict')
            : (result.message ?? t('s09Invoicing.tax.error')),
      });
    setBusy(false);
  }

  async function remove(r: TaxRateView): Promise<void> {
    if (!window.confirm(t('s09Invoicing.tax.confirmDelete'))) return;
    setBusy(true);
    const result = await callJson(`/api/invoices/tax/rates/${r.id}`, 'DELETE');
    if (result.ok) router.refresh();
    else setNote({ ok: false, text: result.message ?? t('s09Invoicing.tax.error') });
    setBusy(false);
  }

  async function applyTemplate(id: string): Promise<void> {
    setBusy(true);
    setNote(null);
    const result = await callJson('/api/invoices/tax/templates', 'POST', { templateId: id });
    const data = result.data as { added?: number; skipped?: number } | null;
    if (result.ok) {
      setNote({
        ok: true,
        text: t('s09Invoicing.tax.templateDone', {
          added: data?.added ?? 0,
          skipped: data?.skipped ?? 0,
        }),
      });
      router.refresh();
    } else setNote({ ok: false, text: result.message ?? t('s09Invoicing.tax.error') });
    setBusy(false);
  }

  return (
    <section className="space-y-sp-12">
      <h2 className="text-lg font-semibold">{t('s09Invoicing.tax.ratesTitle')}</h2>
      <p className="text-sm text-muted-foreground">{t('s09Invoicing.tax.ratesHelp')}</p>
      {rates.length === 0 ? (
        <p className="text-sm">{t('s09Invoicing.tax.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('s09Invoicing.tax.ratesTitle')}</caption>
            <thead>
              <tr className="text-left">
                <th scope="col">{t('s09Invoicing.tax.code')}</th>
                <th scope="col">{t('s09Invoicing.tax.name')}</th>
                <th scope="col" className="text-right">
                  {t('s09Invoicing.tax.rate')}
                </th>
                <th scope="col" className="hidden sm:table-cell">
                  {t('s09Invoicing.tax.kind')}
                </th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} className={r.isActive ? '' : 'text-muted-foreground'}>
                  <td>{r.code}</td>
                  <td>
                    {r.name}
                    {r.compound ? ' *' : ''}
                    {r.isActive ? '' : ` (${t('s09Invoicing.tax.inactive')})`}
                  </td>
                  <td className="text-right">
                    {r.rate.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}%
                  </td>
                  <td className="hidden sm:table-cell">
                    {t(`s09Invoicing.tax.kinds.${r.kind}` as StringKey)}
                  </td>
                  <td className="text-right">
                    {canManage ? (
                      <span className="inline-flex gap-sp-8">
                        <button type="button" className="underline" onClick={() => edit(r)}>
                          {t('s09Invoicing.tax.editRate')}
                        </button>
                        <button
                          type="button"
                          className="underline"
                          disabled={busy}
                          onClick={() => void remove(r)}
                        >
                          {t('s09Invoicing.tax.deleteRate')}
                        </button>
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canManage ? (
        <form
          className="grid gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label>
            {t('s09Invoicing.tax.code')}
            <Input
              value={form.code}
              maxLength={20}
              required
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </label>
          <label className="sm:col-span-2">
            {t('s09Invoicing.tax.name')}
            <Input
              value={form.name}
              maxLength={80}
              required
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            {t('s09Invoicing.tax.rate')}
            <Input
              inputMode="decimal"
              value={form.rate}
              maxLength={9}
              required
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
            />
          </label>
          <label>
            {t('s09Invoicing.tax.kind')}
            <NativeSelect
              value={form.kind}
              onChange={(e) =>
                setForm({ ...form, kind: TAX_KINDS.find((k) => k === e.target.value) ?? 'sales' })
              }
            >
              {TAX_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`s09Invoicing.tax.kinds.${k}` as StringKey)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            {t('s09Invoicing.tax.country')}
            <Input
              value={form.country ?? ''}
              maxLength={2}
              onChange={(e) =>
                setForm({
                  ...form,
                  country: e.target.value === '' ? null : e.target.value.toUpperCase(),
                })
              }
            />
          </label>
          <label>
            {t('s09Invoicing.tax.region')}
            <Input
              value={form.region}
              maxLength={60}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
            />
          </label>
          <label>
            {t('s09Invoicing.tax.sortOrder')}
            <Input
              inputMode="numeric"
              value={String(form.sortOrder)}
              maxLength={4}
              onChange={(e) =>
                setForm({
                  ...form,
                  sortOrder: clampInt(e.target.value, 0, 1000, 0),
                })
              }
            />
          </label>
          <label className="flex items-center gap-sp-8 self-end">
            <input
              type="checkbox"
              checked={form.compound}
              onChange={(e) => setForm({ ...form, compound: e.target.checked })}
            />
            {t('s09Invoicing.tax.compound')}
          </label>
          <label className="flex items-center gap-sp-8 self-end">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            {t('s09Invoicing.tax.active')}
          </label>
          <div className="flex gap-sp-8 sm:col-span-3">
            <Button type="submit" disabled={busy}>
              {busy
                ? t('s09Invoicing.tax.saving')
                : editing
                  ? t('s09Invoicing.tax.saveRate')
                  : t('s09Invoicing.tax.addRate')}
            </Button>
            {editing ? (
              <Button type="button" variant="outline" onClick={() => edit(null)}>
                {t('s09Invoicing.tax.cancel')}
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
      {canManage ? (
        <div className="space-y-sp-8">
          <h3 className="font-medium">{t('s09Invoicing.tax.templatesTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('s09Invoicing.tax.templatesHelp')}</p>
          <ul className="grid gap-sp-8 text-sm sm:grid-cols-2">
            {templates.map((tpl) => (
              <li
                key={tpl.id}
                className="flex items-center justify-between gap-sp-8 rounded-lg border p-sp-8"
              >
                <span>
                  {tpl.name} ({tpl.rates.map((r) => `${r.rate}%`).join(', ')})
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void applyTemplate(tpl.id)}
                >
                  {t('s09Invoicing.tax.addTemplate')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {note ? (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
