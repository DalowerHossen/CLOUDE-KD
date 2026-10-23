// path: components/client/bulk-estimate-reminders.tsx
'use client';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';

interface Item {
  estimateId: string;
  number: string;
  clientName: string;
  validUntil: string;
}
interface Result {
  estimateId: string;
  number: string;
  state: 'sent' | 'skipped' | 'failed';
  reason: string;
}

/** Remind clients whose open estimates end soon: review the list, confirm the number, then send. */
export function BulkEstimateReminders(): JSX.Element {
  const [items, setItems] = useState<Item[] | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function preview(): Promise<void> {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const response = await fetch('/api/portal/bulk/estimates', { cache: 'no-store' });
      const json = (await response.json()) as { data?: Item[] };
      if (!response.ok || !json.data) throw new Error('preview');
      setItems(json.data);
    } catch {
      setError(t('s13Portal.bulk.failed'));
    }
    setBusy(false);
  }

  async function send(): Promise<void> {
    if (!items || items.length === 0) return;
    if (!window.confirm(t('s13Portal.bulk.confirm', { count: items.length }))) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/portal/bulk/estimates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expectedCount: items.length }),
      });
      const json = (await response.json().catch(() => null)) as {
        data?: { results: Result[] };
        error?: { message?: string };
      } | null;
      if (!response.ok || !json?.data)
        throw new Error(json?.error?.message ?? t('s13Portal.bulk.failed'));
      setResults(json.data.results);
      setItems(null);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : t('s13Portal.bulk.failed'));
    }
    setBusy(false);
  }

  return (
    <section className="space-y-sp-8 rounded-md border p-sp-12" aria-labelledby="bulk-title">
      <h2 id="bulk-title" className="font-semibold">
        {t('s13Portal.bulk.title')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('s13Portal.bulk.help')}</p>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => void preview()}
      >
        {t('s13Portal.bulk.check')}
      </Button>
      {items ? (
        items.length === 0 ? (
          <p className="text-sm">{t('s13Portal.bulk.none')}</p>
        ) : (
          <div className="space-y-sp-8">
            <ul className="space-y-1 text-sm">
              {items.map((i) => (
                <li key={i.estimateId}>
                  {i.number} - {i.clientName} ({t('s13Portal.bulk.until', { date: i.validUntil })})
                </li>
              ))}
            </ul>
            <Button type="button" size="sm" disabled={busy} onClick={() => void send()}>
              {t('s13Portal.bulk.send', { count: items.length })}
            </Button>
          </div>
        )
      ) : null}
      {results ? (
        <ul className="space-y-1 text-sm">
          {results.map((r) => (
            <li key={r.estimateId}>
              {r.number}: {t(`s13Portal.bulk.state.${r.state}` as 's13Portal.bulk.state.sent')}
              {r.reason ? ` - ${r.reason}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
