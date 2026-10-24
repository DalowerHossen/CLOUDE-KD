// path: components/client/dispute-actions.tsx
'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { t, type StringKey } from '@/lib/i18n';

interface DisputeActionsProps {
  id: string;
  next: readonly string[];
  closed: boolean;
  reasonCode: string;
  canManage: boolean;
}

/** Move the case, record the real reason and answer date, and add a note. Every change is kept in the case history. */
export function DisputeActions({
  id,
  next,
  closed,
  reasonCode,
  canManage,
}: DisputeActionsProps): JSX.Element | null {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [moveNote, setMoveNote] = useState('');
  const [reason, setReason] = useState(reasonCode);
  const [dueDate, setDueDate] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  if (!canManage || closed) return null;

  async function call(path: string, method: string, body: unknown, done: string): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) throw new Error(json?.error?.message ?? t('s13Portal.disputes.failed'));
      setNotice({ ok: true, text: done });
      router.refresh();
      setBusy(false);
      return true;
    } catch (thrown) {
      setNotice({
        ok: false,
        text: thrown instanceof Error ? thrown.message : t('s13Portal.disputes.failed'),
      });
      setBusy(false);
      return false;
    }
  }

  return (
    <div className="space-y-sp-16 print:hidden">
      {notice ? <Alert variant={notice.ok ? 'success' : 'destructive'}>{notice.text}</Alert> : null}
      <section className="space-y-sp-8">
        <h2 className="font-semibold">{t('s13Portal.disputes.moveTitle')}</h2>
        <Input
          aria-label={t('s13Portal.disputes.moveNote')}
          placeholder={t('s13Portal.disputes.moveNote')}
          value={moveNote}
          onChange={(e) => setMoveNote(e.target.value)}
          maxLength={1000}
          disabled={busy}
        />
        <div className="flex flex-wrap gap-sp-8">
          {next.map((to) => (
            <Button
              key={to}
              type="button"
              size="sm"
              variant={to === 'accepted' || to === 'withdrawn' ? 'outline' : 'secondary'}
              disabled={busy}
              onClick={() => {
                if (
                  (to === 'accepted' || to === 'lost') &&
                  !window.confirm(t('s13Portal.disputes.confirmClose'))
                )
                  return;
                void call(
                  `/api/disputes/${id}/move`,
                  'POST',
                  { to, note: moveNote.trim() },
                  t('s13Portal.disputes.moved'),
                );
              }}
            >
              {t(`s13Portal.disputes.action.${to}` as StringKey)}
            </Button>
          ))}
        </div>
      </section>
      <section className="space-y-sp-8">
        <h2 className="font-semibold">{t('s13Portal.disputes.detailsTitle')}</h2>
        <div className="grid gap-sp-8 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="d-reason">{t('s13Portal.disputes.reasonCode')}</Label>
            <Input
              id="d-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={80}
              disabled={busy}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="d-due">{t('s13Portal.disputes.dueOn')}</Label>
            <Input
              id="d-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || (reason.trim() === '' && dueDate === '')}
          onClick={() =>
            void call(
              `/api/disputes/${id}/details`,
              'PUT',
              {
                reasonCode: reason.trim() === '' ? null : reason.trim(),
                dueAt: dueDate === '' ? null : new Date(`${dueDate}T23:59:00Z`).toISOString(),
              },
              t('s13Portal.disputes.detailsSaved'),
            )
          }
        >
          {t('s13Portal.disputes.saveDetails')}
        </Button>
      </section>
      <section className="space-y-sp-8">
        <h2 className="font-semibold">{t('s13Portal.disputes.noteTitle')}</h2>
        <Input
          aria-label={t('s13Portal.disputes.noteHeading')}
          placeholder={t('s13Portal.disputes.noteHeading')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={busy}
        />
        <Textarea
          aria-label={t('s13Portal.disputes.noteText')}
          placeholder={t('s13Portal.disputes.noteText')}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={5000}
          disabled={busy}
        />
        <Button
          type="button"
          size="sm"
          disabled={busy || title.trim().length < 2}
          onClick={async () => {
            if (
              await call(
                `/api/disputes/${id}/note`,
                'POST',
                { title: title.trim(), content: content.trim() },
                t('s13Portal.disputes.noteSaved'),
              )
            ) {
              setTitle('');
              setContent('');
            }
          }}
        >
          {t('s13Portal.disputes.addNote')}
        </Button>
      </section>
    </div>
  );
}
