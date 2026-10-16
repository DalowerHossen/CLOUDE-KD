// path: components/crm/bulk-bar.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t, type StringKey } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const resultBody = z.object({
  data: z.object({
    done: z.number(),
    failed: z.array(z.object({ id: z.string(), reason: z.string() })),
  }),
});
const ACTIONS = [
  'archive',
  'reactivate',
  'delete',
  'add_tag',
  'remove_tag',
  'set_risk',
  'set_terms',
] as const;
type Action = (typeof ACTIONS)[number];
const LABEL: Record<Action, StringKey> = {
  archive: 's08Crm.bulk.archive',
  reactivate: 's08Crm.bulk.reactivate',
  delete: 's08Crm.bulk.delete',
  add_tag: 's08Crm.bulk.addTag',
  remove_tag: 's08Crm.bulk.removeTag',
  set_risk: 's08Crm.bulk.setRisk',
  set_terms: 's08Crm.bulk.setTerms',
};

/** Reads the ticked rows (checkboxes named "ids" on the page), asks to confirm with the count, then applies. */
export function BulkBar({ allowed }: { allowed: readonly Action[] }): JSX.Element {
  const router = useRouter();
  const [action, setAction] = useState<Action | ''>('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function apply(): Promise<void> {
    setNote(null);
    const ids = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked'),
    ).map((i) => i.value);
    if (action === '' || ids.length === 0) {
      setNote({ ok: false, text: t('s08Crm.bulk.nothingSelected') });
      return;
    }
    if (!window.confirm(t('s08Crm.bulk.confirm', { action: t(LABEL[action]), count: ids.length })))
      return;
    let body: Record<string, unknown> = { action, ids };
    if (action === 'add_tag' || action === 'remove_tag') body = { ...body, value };
    if (action === 'set_risk') body = { ...body, value: value || 'none' };
    if (action === 'set_terms')
      body = { ...body, value: value.trim() === '' ? null : Math.trunc(Number(value)) };
    setBusy(true);
    try {
      const response = await fetch('/api/clients/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const r = resultBody.safeParse(json);
        setNote({
          ok: true,
          text: r.success
            ? t('s08Crm.bulk.result', { done: r.data.data.done, failed: r.data.data.failed.length })
            : t('s08Crm.actions.done'),
        });
        router.refresh();
      } else {
        const err = errorBody.safeParse(json);
        setNote({ ok: false, text: err.success ? err.data.error.message : t('s08Crm.bulk.error') });
      }
    } catch {
      setNote({ ok: false, text: t('s08Crm.bulk.error') });
    }
    setBusy(false);
  }

  return (
    <div
      className="flex flex-wrap items-end gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm"
      role="group"
      aria-label={t('s08Crm.bulk.action')}
    >
      <label>
        <span className="block font-medium">{t('s08Crm.bulk.action')}</span>
        <NativeSelect
          value={action}
          onChange={(e) => setAction(ACTIONS.find((a) => a === e.target.value) ?? '')}
        >
          <option value="">{t('s08Crm.bulk.choose')}</option>
          {allowed.map((a) => (
            <option key={a} value={a}>
              {t(LABEL[a])}
            </option>
          ))}
        </NativeSelect>
      </label>
      {action === 'add_tag' || action === 'remove_tag' || action === 'set_terms' ? (
        <label>
          <span className="block font-medium">{t('s08Crm.bulk.value')}</span>
          <Input value={value} maxLength={30} onChange={(e) => setValue(e.target.value)} />
        </label>
      ) : null}
      {action === 'set_risk' ? (
        <label>
          <span className="block font-medium">{t('s08Crm.bulk.value')}</span>
          <NativeSelect value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="none">{t('s08Crm.form.riskNone')}</option>
            <option value="watch">{t('s08Crm.form.riskWatch')}</option>
            <option value="high">{t('s08Crm.form.riskHigh')}</option>
          </NativeSelect>
        </label>
      ) : null}
      <Button type="button" disabled={busy || action === ''} onClick={() => void apply()}>
        {t('s08Crm.bulk.apply')}
      </Button>
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? '' : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
