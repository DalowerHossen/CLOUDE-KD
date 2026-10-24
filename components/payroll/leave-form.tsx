// path: components/payroll/leave-form.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';

/** The leave request of the employee portal. The link stays in the address; the server decides who the employee is. */
export function LeaveForm({
  token,
  types,
}: {
  token: string;
  types: { id: string; name: string }[];
}): JSX.Element {
  const [typeId, setTypeId] = useState(types[0]?.id ?? '');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch('/api/payroll/portal/leave', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          request: {
            leaveTypeId: typeId,
            startDate: start,
            endDate: end,
            halfDay: half,
            reason,
          },
        }),
        cache: 'no-store',
      });
      setNotice(
        response.ok
          ? { ok: true, text: t('s15Hr.portal.sent') }
          : { ok: false, text: t('s15Hr.portal.failed') },
      );
      if (response.ok) setTimeout(() => window.location.reload(), 800);
    } catch {
      setNotice({ ok: false, text: t('s15Hr.portal.failed') });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-sp-12" noValidate>
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <div className="space-y-1">
        <Label htmlFor="pl-type">{t('s15Hr.portal.type')}</Label>
        <NativeSelect id="pl-type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {types.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label htmlFor="pl-start">{t('s15Hr.portal.start')}</Label>
        <Input id="pl-start" value={start} onChange={(e) => setStart(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="pl-end">{t('s15Hr.portal.end')}</Label>
        <Input id="pl-end" value={end} onChange={(e) => setEnd(e.target.value)} required />
      </div>
      <label className="flex items-center gap-2 text-sm" htmlFor="pl-half">
        <input
          id="pl-half"
          type="checkbox"
          checked={half}
          onChange={(e) => setHalf(e.target.checked)}
        />
        {t('s15Hr.portal.halfDay')}
      </label>
      <div className="space-y-1">
        <Label htmlFor="pl-reason">{t('s15Hr.portal.reason')}</Label>
        <Input
          id="pl-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </div>
      <Button type="submit" disabled={busy || typeId === '' || start === '' || end === ''}>
        {t('s15Hr.portal.send')}
      </Button>
    </form>
  );
}

/** Cancels one waiting request of the employee. */
export function LeaveCancelButton({ token, id }: { token: string; id: string }): JSX.Element {
  const [busy, setBusy] = useState(false);
  async function cancel(): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch('/api/payroll/portal/leave/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, id }),
        cache: 'no-store',
      });
      if (response.ok) window.location.reload();
    } catch {
      /* the request stays as it was; the page shows the same list */
    }
    setBusy(false);
  }
  return (
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void cancel()}>
      {t('s15Hr.portal.cancel')}
    </Button>
  );
}
