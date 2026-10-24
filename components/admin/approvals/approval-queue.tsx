// path: components/admin/approvals/approval-queue.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';
import type { ApprovalListItem } from '@/services/approval/queries';

interface Props {
  items: readonly ApprovalListItem[];
  /** "/api/approvals" for owners or "/api/approvals/platform" for platform staff. */
  apiBase: string;
}

const errorBody = z.object({ error: z.object({ message: z.string() }) });
const bulkBody = z.object({
  data: z.object({ results: z.array(z.object({ ok: z.boolean() })) }),
});
const historyBody = z.object({
  data: z.object({
    steps: z.array(
      z.object({
        id: z.string(),
        level: z.string(),
        status: z.string(),
        reason: z.string().nullable(),
      }),
    ),
  }),
});

type Step = z.infer<typeof historyBody>['data']['steps'][number];
type Notice = { kind: 'success' | 'error'; text: string } | null;

function statusVariant(status: string): 'warning' | 'success' | 'destructive' | 'secondary' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'destructive';
  if (status === 'pending' || status === 'escalated') return 'warning';
  return 'secondary';
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return t('s02Governance.approvals.statusPending');
    case 'approved':
      return t('s02Governance.approvals.statusApproved');
    case 'rejected':
      return t('s02Governance.approvals.statusRejected');
    case 'escalated':
      return t('s02Governance.approvals.statusEscalated');
    case 'expired':
      return t('s02Governance.approvals.statusExpired');
    default:
      return t('s02Governance.approvals.statusCancelled');
  }
}

async function messageOf(response: Response): Promise<string> {
  const parsed = errorBody.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : t('s01Core.states.errorBody');
}

export function ApprovalQueue({ items, apiBase }: Props): JSX.Element {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [steps, setSteps] = useState<readonly Step[]>([]);

  const pending = items.filter((i) => i.status === 'pending' || i.status === 'escalated');

  async function decide(id: string, decision: 'approve' | 'reject'): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/${id}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, reason: decision === 'reject' ? reason : null }),
      });
      if (!response.ok) {
        setNotice({ kind: 'error', text: await messageOf(response) });
        return;
      }
      setNotice({ kind: 'success', text: t('s02Governance.approvals.decided') });
      setRejecting(null);
      setReason('');
      router.refresh();
    } catch {
      setNotice({ kind: 'error', text: t('s01Core.states.errorBody') });
    } finally {
      setBusy(false);
    }
  }

  async function approveSelected(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`${apiBase}/bulk`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], decision: 'approve', reason: null }),
      });
      if (!response.ok) {
        setNotice({ kind: 'error', text: await messageOf(response) });
        return;
      }
      const { data } = bulkBody.parse(await response.json());
      const ok = data.results.filter((r) => r.ok).length;
      setNotice({
        kind: ok === data.results.length ? 'success' : 'error',
        text: t('s02Governance.approvals.bulkDone', { ok, failed: data.results.length - ok }),
      });
      setSelected(new Set());
      router.refresh();
    } catch {
      setNotice({ kind: 'error', text: t('s01Core.states.errorBody') });
    } finally {
      setBusy(false);
    }
  }

  async function toggleHistory(id: string): Promise<void> {
    if (openHistory === id) {
      setOpenHistory(null);
      return;
    }
    setOpenHistory(id);
    setSteps([]);
    try {
      const response = await fetch(`${apiBase}/${id}`);
      if (response.ok) setSteps(historyBody.parse(await response.json()).data.steps);
    } catch {
      setSteps([]);
    }
  }

  function toggle(id: string, checked: boolean): void {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  }

  return (
    <div className="space-y-sp-16">
      <div aria-live="polite">
        {notice ? (
          <Alert variant={notice.kind === 'success' ? 'success' : 'destructive'}>
            <div>{notice.text}</div>
          </Alert>
        ) : null}
      </div>
      {pending.length > 1 ? (
        <Button type="button" onClick={approveSelected} disabled={busy || selected.size === 0}>
          {t('s02Governance.approvals.approveSelected')} ({selected.size})
        </Button>
      ) : null}
      <ul className="space-y-sp-12" aria-label={t('s02Governance.approvals.tableCaption')}>
        {items.map((item) => {
          const open = item.status === 'pending' || item.status === 'escalated';
          return (
            <li key={item.id} className="rounded-lg border bg-card p-sp-16">
              <div className="flex flex-wrap items-start gap-sp-12">
                {open && pending.length > 1 ? (
                  <Checkbox
                    aria-label={t('s02Governance.approvals.selectRow', { action: item.action })}
                    checked={selected.has(item.id)}
                    onCheckedChange={(value) => toggle(item.id, value === true)}
                  />
                ) : null}
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="break-all font-mono text-sm font-semibold">{item.action}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('s02Governance.approvals.colRequester')}: {item.requesterRole} -{' '}
                    <time dateTime={item.createdAt}>
                      {item.createdAt.replace('T', ' ').slice(0, 16)} UTC
                    </time>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={statusVariant(item.status)}>{statusLabel(item.status)}</Badge>
                    <Badge variant="outline">
                      {t('s02Governance.approvals.colLevel')} {item.currentLevel}
                    </Badge>
                    {item.isDraft ? (
                      <Badge variant="info">{t('s02Governance.approvals.draftBadge')}</Badge>
                    ) : null}
                    {item.escalationCount > 0 ? (
                      <Badge variant="warning">
                        {t('s02Governance.approvals.escalated', { count: item.escalationCount })}
                      </Badge>
                    ) : null}
                  </div>
                  {item.decisionReason ? <p className="text-sm">{item.decisionReason}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {open ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => decide(item.id, 'approve')}
                      >
                        {t('s02Governance.approvals.approve')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setRejecting(rejecting === item.id ? null : item.id)}
                      >
                        {t('s02Governance.approvals.reject')}
                      </Button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleHistory(item.id)}
                  >
                    {openHistory === item.id
                      ? t('s02Governance.approvals.hideHistory')
                      : t('s02Governance.approvals.history')}
                  </Button>
                </div>
              </div>
              {rejecting === item.id ? (
                <div className="mt-sp-12 space-y-2">
                  <Label htmlFor={`reason-${item.id}`}>
                    {t('s02Governance.approvals.rejectReason')}
                  </Label>
                  <Textarea
                    id={`reason-${item.id}`}
                    value={reason}
                    maxLength={1000}
                    aria-describedby={`reason-help-${item.id}`}
                    onChange={(event) => setReason(event.target.value)}
                  />
                  <p id={`reason-help-${item.id}`} className="text-caption text-muted-foreground">
                    {t('s02Governance.approvals.rejectReasonHelp')}
                  </p>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={busy || reason.trim().length < 3}
                    onClick={() => decide(item.id, 'reject')}
                  >
                    {t('s02Governance.approvals.confirmReject')}
                  </Button>
                </div>
              ) : null}
              {openHistory === item.id ? (
                <ol className="mt-sp-12 space-y-1 border-t pt-sp-12 text-sm">
                  {steps.length === 0 ? (
                    <li className="text-muted-foreground">
                      {t('s02Governance.approvals.historyEmpty')}
                    </li>
                  ) : (
                    steps.map((step) => (
                      <li key={step.id}>
                        {t('s02Governance.approvals.historyLine', {
                          level: step.level,
                          status: step.status,
                        })}
                        {step.reason ? ` - ${step.reason}` : ''}
                      </li>
                    ))
                  )}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
