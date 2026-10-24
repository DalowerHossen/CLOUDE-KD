// path: components/project/timesheet-entries.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { callJson } from '@/components/invoice/api-call';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t, type StringKey } from '@/lib/i18n';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';

export interface EntryRow {
  id: string;
  projectId: string;
  projectName: string;
  userName: string;
  workDate: string;
  hours: string;
  description: string;
  billable: boolean;
  amount: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'invoiced';
  rejectedReason: string;
  version: number;
  mine: boolean;
}

/** One person's entries: submit drafts, edit hours and notes, delete. Also used to approve with `approvals`. */
export function TimesheetEntries({
  entries,
  approvals,
  showAmounts,
}: {
  entries: EntryRow[];
  /** When true the list is a queue to approve or reject. */
  approvals: boolean;
  showAmounts: boolean;
}): JSX.Element {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');

  const toggle = (id: string): void => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  async function send(url: string, body: unknown, ok: (data: unknown) => string): Promise<void> {
    setBusy(true);
    setMessage(null);
    const r = await callJson(url, 'POST', body);
    if (r.ok) {
      setPicked(new Set());
      setMessage({ ok: true, text: ok(r.data) });
      router.refresh();
    } else setMessage({ ok: false, text: r.message ?? t('s09Projects.time.error') });
    setBusy(false);
  }

  async function saveEdit(row: EntryRow): Promise<void> {
    setBusy(true);
    setMessage(null);
    const r = await callJson(`/api/time/${row.id}`, 'PUT', {
      expectedVersion: row.version,
      entry: {
        projectId: row.projectId,
        workDate: row.workDate,
        hours: hours.trim(),
        description: note,
        billable: row.billable,
        milestoneId: null,
      },
    });
    if (r.ok) {
      setEditing(null);
      router.refresh();
    } else setMessage({ ok: false, text: r.message ?? t('s09Projects.time.error') });
    setBusy(false);
  }

  async function remove(id: string): Promise<void> {
    if (!window.confirm(t('s09Projects.time.confirmDelete'))) return;
    setBusy(true);
    const r = await callJson(`/api/time/${id}`, 'DELETE');
    if (r.ok) router.refresh();
    else setMessage({ ok: false, text: r.message ?? t('s09Projects.time.error') });
    setBusy(false);
  }

  const selectable = entries.filter((e) =>
    approvals
      ? e.status === 'submitted'
      : e.mine && (e.status === 'draft' || e.status === 'rejected'),
  );
  return (
    <div className="space-y-sp-8 text-sm">
      {entries.length === 0 ? (
        <p className="text-muted-foreground">
          {approvals ? t('s09Projects.time.approvalsNone') : t('s09Projects.time.emptyWeek')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <caption className="sr-only">{t('s09Projects.time.entries')}</caption>
            <thead>
              <tr className="border-b text-left">
                <th scope="col" className="w-8" />
                <th scope="col">{t('s09Projects.time.date')}</th>
                {approvals ? <th scope="col">{t('s09Projects.time.person')}</th> : null}
                <th scope="col">{t('s09Projects.time.project')}</th>
                <th scope="col">{t('s09Projects.time.note')}</th>
                <th scope="col" className="text-right">
                  {t('s09Projects.time.hours')}
                </th>
                {showAmounts ? (
                  <th scope="col" className="text-right">
                    {t('s09Invoicing.invoices.total')}
                  </th>
                ) : null}
                <th scope="col">{t('s09Projects.time.status')}</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b align-top">
                  <td>
                    {selectable.includes(e) ? (
                      <input
                        type="checkbox"
                        aria-label={e.projectName}
                        checked={picked.has(e.id)}
                        onChange={() => toggle(e.id)}
                      />
                    ) : null}
                  </td>
                  <td className="py-sp-4">{e.workDate}</td>
                  {approvals ? <td>{e.userName}</td> : null}
                  <td>{e.projectName}</td>
                  <td>
                    {editing === e.id ? (
                      <Input
                        maxLength={1000}
                        value={note}
                        onChange={(ev) => setNote(ev.target.value)}
                      />
                    ) : (
                      e.description
                    )}
                    {e.status === 'rejected' && e.rejectedReason ? (
                      <span className="block text-destructive">
                        {t('s09Projects.time.rejected', { reason: e.rejectedReason })}
                      </span>
                    ) : null}
                  </td>
                  <td className="text-right">
                    {editing === e.id ? (
                      <Input
                        inputMode="decimal"
                        className="w-20"
                        value={hours}
                        onChange={(ev) => setHours(ev.target.value)}
                      />
                    ) : (
                      e.hours
                    )}
                  </td>
                  {showAmounts ? (
                    <td className="text-right">
                      {e.billable ? formatMoney(Money.parse(e.amount)) : '-'}
                    </td>
                  ) : null}
                  <td>{t(`s09Projects.time.statuses.${e.status}` as StringKey)}</td>
                  <td className="space-x-sp-4 whitespace-nowrap">
                    {!approvals && e.mine && (e.status === 'draft' || e.status === 'rejected') ? (
                      editing === e.id ? (
                        <Button type="button" disabled={busy} onClick={() => void saveEdit(e)}>
                          {t('s09Projects.form.save')}
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setEditing(e.id);
                              setHours(e.hours);
                              setNote(e.description);
                            }}
                          >
                            {t('s09Projects.time.edit')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void remove(e.id)}
                          >
                            {t('s09Projects.time.delete')}
                          </Button>
                        </>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectable.length > 0 ? (
        approvals ? (
          <div className="flex flex-wrap items-end gap-sp-8">
            <Button
              type="button"
              disabled={busy || picked.size === 0}
              onClick={() =>
                void send(
                  '/api/time/decide',
                  { ids: [...picked], action: 'approve', reason: '' },
                  (d) =>
                    t('s09Projects.time.decided', {
                      count: String((d as { decided?: number }).decided ?? 0),
                    }),
                )
              }
            >
              {t('s09Projects.time.approve')}
            </Button>
            <label>
              <span className="sr-only">{t('s09Projects.time.rejectReason')}</span>
              <Input
                placeholder={t('s09Projects.time.rejectReason')}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={busy || picked.size === 0 || reason.trim().length < 3}
              onClick={() =>
                void send(
                  '/api/time/decide',
                  { ids: [...picked], action: 'reject', reason: reason.trim() },
                  (d) =>
                    t('s09Projects.time.decided', {
                      count: String((d as { decided?: number }).decided ?? 0),
                    }),
                )
              }
            >
              {t('s09Projects.time.reject')}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            disabled={busy || picked.size === 0}
            onClick={() =>
              void send('/api/time/submit', { ids: [...picked] }, (d) =>
                t('s09Projects.time.submitted', {
                  count: String((d as { submitted?: number }).submitted ?? 0),
                }),
              )
            }
          >
            {t('s09Projects.time.submitSelected')}
          </Button>
        )
      ) : null}
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? undefined : 'text-destructive'}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
