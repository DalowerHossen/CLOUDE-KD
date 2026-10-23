// path: components/admin/approvals/delegation-form.tsx
'use client';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function DelegationForm({ apiBase }: { apiBase: string }): JSX.Element {
  const [delegateId, setDelegateId] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const endsAt = Number.isNaN(Date.parse(until)) ? null : new Date(until).toISOString();
  const valid = UUID_RE.test(delegateId) && endsAt !== null;

  async function submit(): Promise<void> {
    if (!valid || endsAt === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`${apiBase}/delegations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ delegateId, endsAt }),
      });
      setMessage(
        response.ok
          ? { ok: true, text: t('s02Governance.approvals.delegateSaved') }
          : { ok: false, text: t('s01Core.states.errorBody') },
      );
    } catch {
      setMessage({ ok: false, text: t('s01Core.states.errorBody') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-sp-16" aria-labelledby="delegate-title">
      <h2 id="delegate-title" className="text-h4 font-semibold">
        {t('s02Governance.approvals.delegateTitle')}
      </h2>
      <p className="mb-sp-12 text-sm text-muted-foreground">
        {t('s02Governance.approvals.delegateBody')}
      </p>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="delegate-user">{t('s02Governance.approvals.delegateUser')}</Label>
          <Input
            id="delegate-user"
            value={delegateId}
            onChange={(e) => setDelegateId(e.target.value.trim())}
            maxLength={36}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="delegate-until">{t('s02Governance.approvals.delegateUntil')}</Label>
          <Input
            id="delegate-until"
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        </div>
      </div>
      <Button type="button" className="mt-sp-12" disabled={busy || !valid} onClick={submit}>
        {t('s02Governance.approvals.delegateSave')}
      </Button>
      <div aria-live="polite">
        {message ? (
          <Alert className="mt-sp-12" variant={message.ok ? 'success' : 'destructive'}>
            <div>{message.text}</div>
          </Alert>
        ) : null}
      </div>
    </section>
  );
}
