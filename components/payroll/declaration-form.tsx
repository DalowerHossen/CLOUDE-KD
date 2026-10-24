// path: components/payroll/declaration-form.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import { toInt } from '@/lib/reports/numbers';

/** The tax declaration of the employee portal. The link stays in the address; the server decides who the employee is. */
export function DeclarationForm({ token }: { token: string }): JSX.Element {
  const [status, setStatus] = useState('');
  const [allowances, setAllowances] = useState('0');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/payroll/portal/declaration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          filingStatus: status,
          allowances: toInt(allowances, 0),
          note,
        }),
        cache: 'no-store',
      });
      setNotice(
        response.ok
          ? { ok: true, text: t('s15Payroll.portal.sent') }
          : { ok: false, text: t('s15Payroll.portal.failed') },
      );
      if (response.ok) setTimeout(() => window.location.reload(), 800);
    } catch {
      setNotice({ ok: false, text: t('s15Payroll.portal.failed') });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="space-y-1">
        <Label htmlFor="pd-status">{t('s15Payroll.portal.filingStatus')}</Label>
        <Input
          id="pd-status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          maxLength={40}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pd-allow">{t('s15Payroll.portal.allowances')}</Label>
        <Input
          id="pd-allow"
          inputMode="numeric"
          value={allowances}
          onChange={(e) => setAllowances(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pd-note">{t('s15Payroll.portal.note')}</Label>
        <Input
          id="pd-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
        />
      </div>
      <Button type="submit" disabled={busy || status.trim() === ''}>
        {t('s15Payroll.portal.send')}
      </Button>
    </form>
  );
}
