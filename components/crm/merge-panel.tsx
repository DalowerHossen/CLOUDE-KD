// path: components/crm/merge-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
interface Side {
  id: string;
  name: string;
  email: string | null;
}

export function MergePanel({ first, second }: { first: Side; second: Side }): JSX.Element {
  const router = useRouter();
  const [keep, setKeep] = useState<'first' | 'second'>('first');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const kept = keep === 'first' ? first : second;
  const removed = keep === 'first' ? second : first;

  async function merge(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch('/api/clients/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keepId: kept.id, removeId: removed.id }),
      });
      if (response.ok) {
        router.replace(`/clients/${kept.id}`);
        router.refresh();
        return;
      }
      const err = errorBody.safeParse(await response.json().catch(() => null));
      setNote({ ok: false, text: err.success ? err.data.error.message : t('s08Crm.merge.error') });
    } catch {
      setNote({ ok: false, text: t('s08Crm.merge.error') });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-sp-12">
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <section className="rounded-lg border bg-card p-sp-16 text-sm">
          <h2 className="font-semibold">{t('s08Crm.merge.keep')}</h2>
          <p className="text-h4">{kept.name}</p>
          <p className="text-muted-foreground">{kept.email ?? '-'}</p>
        </section>
        <section className="rounded-lg border border-dashed bg-card p-sp-16 text-sm">
          <h2 className="font-semibold">{t('s08Crm.merge.remove')}</h2>
          <p className="text-h4">{removed.name}</p>
          <p className="text-muted-foreground">{removed.email ?? '-'}</p>
        </section>
      </div>
      <div className="flex flex-wrap gap-sp-8">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setKeep(keep === 'first' ? 'second' : 'first')}
        >
          {t('s08Crm.merge.swap')}
        </Button>
        <Button type="button" variant="destructive" disabled={busy} onClick={() => void merge()}>
          {t('s08Crm.merge.confirm')}
        </Button>
      </div>
      {note ? (
        <p role="alert" className="text-sm text-destructive">
          {note.text}
        </p>
      ) : null}
    </div>
  );
}
