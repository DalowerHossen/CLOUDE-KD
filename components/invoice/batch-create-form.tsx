// path: components/invoice/batch-create-form.tsx
'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';
import type { InvoiceInput } from '@/lib/invoice/input';

const clientHits = z.object({
  data: z.object({ rows: z.array(z.object({ id: z.string(), name: z.string() })) }),
});
const created = z.object({ id: z.string() });

export function BatchCreateForm({
  template,
  summary,
  isOwner,
}: {
  template: InvoiceInput;
  summary: string;
  isOwner: boolean;
}): JSX.Element {
  const router = useRouter();
  const [chosen, setChosen] = useState<{ id: string; name: string }[]>([]);
  const [hits, setHits] = useState<{ id: string; name: string }[]>([]);
  const [autoSend, setAutoSend] = useState(false);
  const [message, setMessage] = useState('');
  const [runAfter, setRunAfter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(crypto.randomUUID());

  async function search(text: string): Promise<void> {
    if (text.trim().length < 2) return setHits([]);
    const r = await fetch(
      `/api/clients?${new URLSearchParams({ q: text.trim() }).toString()}`,
    ).catch(() => null);
    const parsed = clientHits.safeParse(await r?.json().catch(() => null));
    setHits(
      parsed.success
        ? parsed.data.data.rows.filter((h) => !chosen.some((c) => c.id === h.id)).slice(0, 8)
        : [],
    );
  }

  async function start(): Promise<void> {
    setBusy(true);
    setError(null);
    const r = await callJson(
      '/api/invoices/batches',
      'POST',
      {
        action: 'create',
        clientIds: chosen.map((c) => c.id),
        template: { ...template, clientId: null, walkInName: '' },
        autoSend,
        message,
        runAfter: runAfter === '' ? null : new Date(runAfter).toISOString(),
      },
      { 'idempotency-key': key.current },
    );
    if (r.ok) {
      const parsed = created.safeParse(r.data);
      if (parsed.success) router.push(`/invoices/batches/${parsed.data.id}`);
    } else {
      key.current = crypto.randomUUID();
      setError(r.message ?? t('s09Batches.bar.error'));
    }
    setBusy(false);
  }

  return (
    <form
      className="space-y-sp-16 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void start();
      }}
    >
      <p className="rounded-lg border bg-card p-sp-12">
        <span className="font-medium">{t('s09Batches.create.template')}:</span> {summary}
      </p>
      <div className="space-y-sp-8">
        <label className="block">
          {t('s09Batches.create.search')}
          <Input maxLength={80} onChange={(e) => void search(e.target.value)} />
        </label>
        {hits.length > 0 ? (
          <ul className="rounded-lg border">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="w-full px-sp-8 py-sp-4 text-left hover:bg-muted"
                  onClick={() => {
                    setChosen([...chosen, h]);
                    setHits([]);
                  }}
                >
                  {h.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <h2 className="font-medium">
          {t('s09Batches.create.chosen', { count: String(chosen.length) })}
        </h2>
        {chosen.length === 0 ? (
          <p className="text-muted-foreground">{t('s09Batches.create.none')}</p>
        ) : (
          <ul className="space-y-sp-4">
            {chosen.map((c) => (
              <li key={c.id} className="flex items-center gap-sp-8">
                {c.name}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setChosen(chosen.filter((x) => x.id !== c.id))}
                >
                  {t('s09Batches.create.remove')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="flex items-center gap-sp-8">
        <input
          type="checkbox"
          checked={autoSend}
          disabled={!isOwner}
          onChange={(e) => setAutoSend(e.target.checked)}
        />
        {t('s09Batches.create.autoSend')}
        {!isOwner ? (
          <span className="text-muted-foreground">{t('s09Batches.create.autoSendOwner')}</span>
        ) : null}
      </label>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <label>
          {t('s09Batches.bar.message')}
          <Input maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <label>
          {t('s09Batches.bar.runAfter')}
          <Input
            type="datetime-local"
            value={runAfter}
            onChange={(e) => setRunAfter(e.target.value)}
          />
        </label>
      </div>
      <Button type="submit" disabled={busy || chosen.length === 0}>
        {busy ? t('s09Batches.bar.starting') : t('s09Batches.create.start')}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
