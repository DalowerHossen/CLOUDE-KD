// path: components/admin/compliance/dsar-actions.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const eraseBody = z.object({ data: z.object({ certificateHash: z.string() }) });

interface Props {
  id: string;
  requestType: string;
  status: string;
}

export function DsarActions({ id, requestType, status }: Props): JSX.Element | null {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (status === 'completed' || status === 'rejected') return null;

  async function act(action: 'export' | 'erase' | 'reject'): Promise<void> {
    if (action === 'erase' && !window.confirm(t('s02Governance.compliance.confirmErase'))) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/compliance/dsar/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, reason: action === 'reject' ? reason : null }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const parsed = errorBody.safeParse(json);
        setMessage({
          ok: false,
          text: parsed.success ? parsed.data.error.message : t('s01Core.states.errorBody'),
        });
        return;
      }
      if (action === 'export') {
        const blob = new Blob(
          [JSON.stringify(z.object({ data: z.unknown() }).parse(json).data, null, 2)],
          {
            type: 'application/json',
          },
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `subject-export-${id}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setMessage({ ok: true, text: t('s02Governance.compliance.exportReady') });
      } else if (action === 'erase') {
        const hash = eraseBody.parse(json).data.certificateHash;
        setMessage({ ok: true, text: t('s02Governance.compliance.eraseDone', { hash }) });
      } else {
        setMessage({ ok: true, text: t('s02Governance.compliance.rejected') });
        setRejecting(false);
      }
      router.refresh();
    } catch {
      setMessage({ ok: false, text: t('s01Core.states.errorBody') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {requestType === 'export' ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => act('export')}>
            {t('s02Governance.compliance.actionExport')}
          </Button>
        ) : null}
        {requestType === 'erase' ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => act('erase')}
          >
            {t('s02Governance.compliance.actionErase')}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setRejecting(!rejecting)}
        >
          {t('s02Governance.compliance.actionReject')}
        </Button>
      </div>
      {rejecting ? (
        <div className="space-y-1">
          <Label htmlFor={`dsar-reason-${id}`}>{t('s02Governance.compliance.rejectReason')}</Label>
          <Input
            id={`dsar-reason-${id}`}
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || reason.trim().length < 3}
            onClick={() => act('reject')}
          >
            {t('s02Governance.compliance.actionReject')}
          </Button>
        </div>
      ) : null}
      <div aria-live="polite">
        {message ? (
          <Alert variant={message.ok ? 'success' : 'destructive'}>
            <div className="break-all">{message.text}</div>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
