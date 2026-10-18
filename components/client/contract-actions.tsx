// path: components/client/contract-actions.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

type Action = 'send' | 'remind' | 'void';

/** Send for signature, remind the signers who have not signed, or cancel the request. */
export function ContractActions({
  id,
  status,
  canSend,
}: {
  id: string;
  status: string;
  canSend: boolean;
}): JSX.Element | null {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const open = status === 'sent' || status === 'viewed' || status === 'partly_signed';
  if (!canSend || !(status === 'draft' || open)) return null;

  async function run(action: Action, body: Record<string, unknown>, done: string): Promise<void> {
    setBusy(action);
    setNotice(null);
    try {
      const response = await fetch(`/api/contracts/${id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => null)) as {
        data?: { failed?: string[] };
        error?: { message?: string };
      } | null;
      if (!response.ok)
        throw new Error(json?.error?.message ?? t('s13Portal.contracts.actionFailed'));
      const failed = json?.data?.failed ?? [];
      setNotice({
        ok: failed.length === 0,
        text:
          failed.length === 0
            ? done
            : t('s13Portal.contracts.someFailed', { emails: failed.join(', ') }),
      });
      router.refresh();
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s13Portal.contracts.actionFailed'),
      });
    }
    setBusy(null);
  }

  return (
    <div className="space-y-sp-12 print:hidden">
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      {status === 'draft' ? (
        <div className="space-y-1">
          <Label htmlFor="ct-message">{t('s13Portal.contracts.message')}</Label>
          <Input
            id="ct-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            disabled={busy !== null}
          />
          <Button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (window.confirm(t('s13Portal.contracts.confirmSend')))
                void run('send', { message }, t('s13Portal.contracts.sent'));
            }}
          >
            {t('s13Portal.contracts.send')}
          </Button>
        </div>
      ) : null}
      {open ? (
        <div className="flex flex-col gap-sp-8 sm:flex-row sm:items-end">
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void run('remind', {}, t('s13Portal.contracts.reminded'))}
          >
            {t('s13Portal.contracts.remind')}
          </Button>
          <div className="flex-1 space-y-1">
            <Label htmlFor="ct-reason">{t('s13Portal.contracts.voidReason')}</Label>
            <Input
              id="ct-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              disabled={busy !== null}
            />
          </div>
          <Button
            type="button"
            variant="destructive"
            disabled={busy !== null || reason.trim().length < 3}
            onClick={() =>
              void run('void', { reason: reason.trim() }, t('s13Portal.contracts.voided'))
            }
          >
            {t('s13Portal.contracts.void')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
