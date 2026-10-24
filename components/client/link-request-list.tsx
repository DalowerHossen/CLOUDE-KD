// path: components/client/link-request-list.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t, type StringKey } from '@/lib/i18n';

export interface LinkRequestRow {
  id: string;
  label: string;
  status: 'pending' | 'approved' | 'denied';
  requestedAt: string;
  deniedReason: string;
}

/** Waiting requests with Approve and Deny; the answer of each request is final. */
export function LinkRequestList({ rows }: { rows: LinkRequestRow[] }): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [denying, setDenying] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function decide(id: string, decision: 'approve' | 'deny'): Promise<void> {
    setBusy(id);
    setNotice(null);
    try {
      const response = await fetch(`/api/portal/link-requests/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, reason: decision === 'deny' ? reason.trim() : '' }),
      });
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t('s13Portal.requests.failed'));
      setNotice({
        ok: true,
        text:
          decision === 'approve'
            ? t('s13Portal.requests.approved')
            : t('s13Portal.requests.denied'),
      });
      setDenying(null);
      setReason('');
      router.refresh();
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s13Portal.requests.failed'),
      });
    }
    setBusy(null);
  }

  return (
    <div className="space-y-sp-12">
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s13Portal.requests.empty')}</p>
      ) : null}
      <ul className="space-y-sp-8">
        {rows.map((row) => (
          <li key={row.id} className="space-y-sp-8 rounded-md border p-sp-12">
            <div className="flex flex-wrap items-center justify-between gap-sp-8">
              <div>
                <p className="font-semibold">{row.label}</p>
                <p className="text-caption text-muted-foreground">
                  {row.requestedAt.replace('T', ' ').slice(0, 16)}
                </p>
              </div>
              <Badge
                variant={
                  row.status === 'approved'
                    ? 'success'
                    : row.status === 'denied'
                      ? 'secondary'
                      : 'warning'
                }
              >
                {t(`s13Portal.requests.status.${row.status}` as StringKey)}
              </Badge>
            </div>
            {row.status === 'denied' && row.deniedReason ? (
              <p className="text-sm text-muted-foreground">{row.deniedReason}</p>
            ) : null}
            {row.status === 'pending' ? (
              <div className="space-y-sp-8">
                <div className="flex gap-sp-8">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void decide(row.id, 'approve')}
                  >
                    {t('s13Portal.requests.approve')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => setDenying(denying === row.id ? null : row.id)}
                  >
                    {t('s13Portal.requests.deny')}
                  </Button>
                </div>
                {denying === row.id ? (
                  <div className="flex gap-sp-8">
                    <Input
                      aria-label={t('s13Portal.requests.reason')}
                      placeholder={t('s13Portal.requests.reason')}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={500}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={busy !== null || reason.trim().length < 3}
                      onClick={() => void decide(row.id, 'deny')}
                    >
                      {t('s13Portal.requests.confirmDeny')}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
