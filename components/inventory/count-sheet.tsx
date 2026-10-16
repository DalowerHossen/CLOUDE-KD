// path: components/inventory/count-sheet.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@/lib/utils/currency';
import { t } from '@/lib/i18n';
import type { CountView } from '@/services/inventory/counts';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const trim = (v: string): string => v.replace(/0+$/, '').replace(/\.$/, '');

function difference(counted: string, expected: string): string | null {
  try {
    if (counted.trim() === '') return null;
    return trim(Money.parse(counted).sub(expected).toDbString());
  } catch {
    return null;
  }
}

export function CountSheet({
  count,
  canEdit,
}: {
  count: CountView;
  canEdit: boolean;
}): JSX.Element {
  const router = useRouter();
  const open = count.status === 'open';
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(count.lines.map((l) => [l.id, l.counted === null ? '' : trim(l.counted)])),
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(): Promise<boolean> {
    try {
      const response = await fetch(`/api/inventory/counts/${count.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          counts: count.lines.map((l) => ({
            lineId: l.id,
            countedQty: (values[l.id] ?? '').trim() === '' ? null : (values[l.id] ?? '').trim(),
          })),
        }),
      });
      if (response.ok) return true;
      const err = errorBody.safeParse(await response.json().catch(() => null));
      setNote({ ok: false, text: err.success ? err.data.error.message : t('s08Crm.counts.error') });
    } catch {
      setNote({ ok: false, text: t('s08Crm.counts.error') });
    }
    return false;
  }

  async function run(action: 'save' | 'complete' | 'cancel'): Promise<void> {
    if (action === 'complete' && !window.confirm(t('s08Crm.counts.confirmComplete'))) return;
    setBusy(true);
    setNote(null);
    if (action !== 'cancel' && !(await save())) return setBusy(false);
    if (action === 'save') {
      setNote({ ok: true, text: t('s08Crm.counts.saved') });
      router.refresh();
      return setBusy(false);
    }
    try {
      const response = await fetch(`/api/inventory/counts/${count.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const r = z.object({ data: z.object({ changed: z.number() }) }).safeParse(json);
        setNote({
          ok: true,
          text:
            action === 'complete'
              ? t('s08Crm.counts.completed', { changed: r.success ? r.data.data.changed : 0 })
              : t('s08Crm.counts.saved'),
        });
        router.refresh();
      } else {
        const err = errorBody.safeParse(json);
        setNote({
          ok: false,
          text: err.success ? err.data.error.message : t('s08Crm.counts.error'),
        });
      }
    } catch {
      setNote({ ok: false, text: t('s08Crm.counts.error') });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-sp-12 text-sm">
      {open ? <p className="text-muted-foreground">{t('s08Crm.counts.help')}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left">
              <th>{t('s08Crm.inventory.product')}</th>
              <th className="text-right">{t('s08Crm.counts.expected')}</th>
              <th className="text-right">{t('s08Crm.counts.counted')}</th>
              <th className="text-right">{t('s08Crm.counts.difference')}</th>
            </tr>
          </thead>
          <tbody>
            {count.lines.map((l) => {
              const diff = open
                ? difference(values[l.id] ?? '', l.expected)
                : l.applied === null
                  ? null
                  : trim(l.applied);
              return (
                <tr key={l.id} className="border-t">
                  <td className="py-1">
                    {l.productName}
                    {l.variantName ? ` - ${l.variantName}` : ''}{' '}
                    {l.sku ? <span className="text-muted-foreground">({l.sku})</span> : null}
                  </td>
                  <td className="text-right">{trim(l.expected)}</td>
                  <td className="text-right">
                    {open && canEdit ? (
                      <Input
                        className="ml-auto w-28 text-right"
                        inputMode="decimal"
                        aria-label={`${t('s08Crm.counts.counted')} ${l.productName}`}
                        value={values[l.id] ?? ''}
                        maxLength={20}
                        onChange={(e) => setValues({ ...values, [l.id]: e.target.value })}
                      />
                    ) : l.counted === null ? (
                      '-'
                    ) : (
                      trim(l.counted)
                    )}
                  </td>
                  <td className={`text-right ${diff && !/^-?0$/.test(diff) ? 'font-medium' : ''}`}>
                    {diff ?? '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && canEdit ? (
        <div className="flex flex-wrap gap-sp-8">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void run('save')}>
            {t('s08Crm.counts.saveCounts')}
          </Button>
          <Button type="button" disabled={busy} onClick={() => void run('complete')}>
            {t('s08Crm.counts.complete')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void run('cancel')}
          >
            {t('s08Crm.counts.cancel')}
          </Button>
        </div>
      ) : null}
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? '' : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
