// path: components/invoice/invoice-history.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { diffInputs, type DiffEntry } from '@/lib/invoice/diff';
import { invoiceInputSchema, type InvoiceInput } from '@/lib/invoice/input';
import type { InvoiceEventView } from '@/services/invoice/events';
import type { RevisionRow } from '@/services/invoice/invoices';
import { callJson } from './api-call';

export function InvoiceHistory({
  id,
  version,
  events,
  revisions,
  current,
  canRestore,
}: {
  id: string;
  version: number;
  events: InvoiceEventView[];
  revisions: RevisionRow[];
  current: InvoiceInput;
  canRestore: boolean;
}): JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState<{ revision: number; changes: DiffEntry[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function compare(revision: number): Promise<void> {
    setBusy(true);
    const r = await callJson(`/api/invoices/${id}/revisions/${revision}`, 'GET');
    const snap = (r.data as { input?: unknown } | null)?.input;
    const parsed = invoiceInputSchema.safeParse(snap);
    setOpen(parsed.success ? { revision, changes: diffInputs(parsed.data, current) } : null);
    setBusy(false);
  }

  async function restore(revision: number): Promise<void> {
    setBusy(true);
    setNote(null);
    const r = await callJson(`/api/invoices/${id}/revisions/${revision}`, 'POST', {
      expectedVersion: version,
    });
    if (r.ok) {
      setNote({ ok: true, text: t('s09Invoicing.invoices.revisionRestored') });
      router.refresh();
    } else setNote({ ok: false, text: r.message ?? t('s09Invoicing.invoices.error') });
    setBusy(false);
  }

  return (
    <div className="grid gap-sp-16 text-sm lg:grid-cols-2 print:hidden">
      <section className="space-y-sp-8">
        <h2 className="text-lg font-semibold">{t('s09Invoicing.invoices.timeline')}</h2>
        {events.length === 0 ? (
          <p>{t('s09Invoicing.invoices.noEvents')}</p>
        ) : (
          <ol className="space-y-sp-4 border-l pl-sp-12">
            {events.map((e) => (
              <li key={e.id}>
                <span className="text-muted-foreground">
                  {e.createdAt.slice(0, 16).replace('T', ' ')}
                </span>{' '}
                {e.message}
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="space-y-sp-8">
        <h2 className="text-lg font-semibold">{t('s09Invoicing.invoices.revisions')}</h2>
        <ul className="space-y-sp-4">
          {revisions.map((r) => (
            <li key={r.revision} className="flex flex-wrap items-center gap-sp-8">
              <span>
                {t('s09Invoicing.invoices.revisionLabel', { n: r.revision })} - {r.reason} -{' '}
                {r.createdAt.slice(0, 16).replace('T', ' ')}
              </span>
              <button
                type="button"
                className="underline"
                disabled={busy}
                onClick={() => void compare(r.revision)}
              >
                {t('s09Invoicing.invoices.revisionCompare')}
              </button>
              {canRestore ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void restore(r.revision)}
                >
                  {t('s09Invoicing.invoices.revisionRestore')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {open ? (
          <div className="rounded-lg border bg-card p-sp-8">
            <h3 className="font-medium">
              {t('s09Invoicing.invoices.revisionChanges', { n: open.revision })}
            </h3>
            {open.changes.length === 0 ? (
              <p>{t('s09Invoicing.invoices.revisionNoChanges')}</p>
            ) : (
              <ul className="list-disc pl-sp-16">
                {open.changes.map((c) => (
                  <li key={`${c.field}-${c.from}-${c.to}`}>
                    {c.field}: {c.from} {'->'} {c.to}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        {note ? (
          <p role={note.ok ? 'status' : 'alert'} className={note.ok ? '' : 'text-destructive'}>
            {note.text}
          </p>
        ) : null}
      </section>
    </div>
  );
}
