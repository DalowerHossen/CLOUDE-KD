// path: components/invoice/remit-to-form.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import type { RemitTo } from '@/lib/invoice/remit';
import { callJson } from './api-call';

export function RemitToForm({ initial }: { initial: RemitTo }): JSX.Element {
  const [s, setS] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof RemitTo>(k: K, v: string): void => setS({ ...s, [k]: v });

  async function save(): Promise<void> {
    setBusy(true);
    setNote(null);
    const r = await callJson('/api/invoices/tax/remit-to', 'PUT', s);
    setNote(
      r.ok
        ? { ok: true, text: t('s09Invoicing.tax.saved') }
        : { ok: false, text: r.message ?? t('s09Invoicing.tax.error') },
    );
    setBusy(false);
  }

  return (
    <form
      className="grid gap-sp-12 text-sm sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="text-lg font-semibold sm:col-span-2">{t('s09Invoicing.tax.remitTitle')}</h2>
      <p className="text-muted-foreground sm:col-span-2">{t('s09Invoicing.tax.remitHelp')}</p>
      <label>
        {t('s09Invoicing.tax.bankName')}
        <Input
          maxLength={100}
          value={s.bankName}
          onChange={(e) => set('bankName', e.target.value)}
        />
      </label>
      <label>
        {t('s09Invoicing.tax.accountName')}
        <Input
          maxLength={100}
          value={s.accountName}
          onChange={(e) => set('accountName', e.target.value)}
        />
      </label>
      <label>
        {t('s09Invoicing.tax.accountNumber')}
        <Input
          maxLength={34}
          autoComplete="off"
          value={s.accountNumber}
          onChange={(e) => set('accountNumber', e.target.value)}
        />
      </label>
      <label>
        {t('s09Invoicing.tax.routingNumber')}
        <Input
          maxLength={20}
          autoComplete="off"
          value={s.routingNumber}
          onChange={(e) => set('routingNumber', e.target.value)}
        />
      </label>
      <label>
        {t('s09Invoicing.tax.swift')}
        <Input maxLength={11} value={s.swift} onChange={(e) => set('swift', e.target.value)} />
      </label>
      <label>
        {t('s09Invoicing.tax.iban')}
        <Input maxLength={34} value={s.iban} onChange={(e) => set('iban', e.target.value)} />
      </label>
      <label className="sm:col-span-2">
        {t('s09Invoicing.tax.instructions')}
        <Input
          maxLength={500}
          value={s.instructions}
          onChange={(e) => set('instructions', e.target.value)}
        />
      </label>
      {note ? (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={note.ok ? 'sm:col-span-2' : 'text-destructive sm:col-span-2'}
        >
          {note.text}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {t('s09Invoicing.tax.saveRemit')}
        </Button>
      </div>
    </form>
  );
}
