// path: components/crm/client-data-panel.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { t, type StringKey } from '@/lib/i18n';
import type { PrivacyRequestView } from '@/services/client/privacy';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function ClientDataPanel({
  clientId,
  canExport,
  canRequest,
  anonymized,
  requests,
}: {
  clientId: string;
  canExport: boolean;
  canRequest: boolean;
  anonymized: boolean;
  requests: PrivacyRequestView[];
}): JSX.Element {
  const router = useRouter();
  const [kind, setKind] = useState<'anonymize' | 'delete'>('anonymize');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function download(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch(`/api/clients/${clientId}/export`);
      if (!response.ok) throw new Error('export');
      const json: unknown = await response.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `client-${clientId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setNote({ ok: false, text: t('s08Crm.data.exportError') });
    }
    setBusy(false);
  }

  async function request(): Promise<void> {
    if (
      !window.confirm(
        kind === 'delete' ? t('s08Crm.data.delete') + '?' : t('s08Crm.data.anonymize') + '?',
      )
    )
      return;
    setBusy(true);
    setNote(null);
    try {
      const response = await fetch('/api/clients/privacy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, kind, reason }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const status = z.object({ data: z.object({ status: z.string() }) }).safeParse(json);
        const waiting = status.success && status.data.data.status === 'awaiting_approval';
        setNote({
          ok: true,
          text: waiting ? t('s08Crm.data.sentWaiting') : t('s08Crm.data.sentDirect'),
        });
        setReason('');
        router.refresh();
      } else {
        const err = errorBody.safeParse(json);
        setNote({ ok: false, text: err.success ? err.data.error.message : t('s08Crm.data.error') });
      }
    } catch {
      setNote({ ok: false, text: t('s08Crm.data.error') });
    }
    setBusy(false);
  }

  return (
    <section
      className="space-y-sp-12 rounded-lg border bg-card p-sp-16 text-sm"
      aria-label={t('s08Crm.data.title')}
    >
      <h2 className="text-h4 font-semibold">{t('s08Crm.data.title')}</h2>
      {canExport ? (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void download()}>
          {t('s08Crm.data.export')}
        </Button>
      ) : null}
      {canRequest && !anonymized ? (
        <div className="space-y-sp-8">
          <h3 className="font-medium">{t('s08Crm.data.privacyTitle')}</h3>
          <p className="text-muted-foreground">{t('s08Crm.data.privacyHelp')}</p>
          <label className="block">
            <span className="block font-medium">{t('s08Crm.data.kind')}</span>
            <NativeSelect
              value={kind}
              onChange={(e) => setKind(e.target.value === 'delete' ? 'delete' : 'anonymize')}
            >
              <option value="anonymize">{t('s08Crm.data.anonymize')}</option>
              <option value="delete">{t('s08Crm.data.delete')}</option>
            </NativeSelect>
          </label>
          <label className="block">
            <span className="block font-medium">{t('s08Crm.data.reason')}</span>
            <Textarea
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || reason.trim().length < 10}
            onClick={() => void request()}
          >
            {t('s08Crm.data.submit')}
          </Button>
        </div>
      ) : null}
      {requests.length > 0 ? (
        <div>
          <h3 className="font-medium">{t('s08Crm.data.history')}</h3>
          <ul className="mt-1 space-y-1">
            {requests.map((r) => (
              <li key={r.id}>
                {r.createdAt.slice(0, 10)} - {r.kind} -{' '}
                {t(`s08Crm.data.statuses.${r.status}` as StringKey)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {note ? (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? '' : 'text-destructive'}>
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
