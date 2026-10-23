// path: components/admin/audit/audit-toolbar.tsx
'use client';
import { useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';

const verifyResponse = z.object({
  data: z.object({
    chain: z.object({
      ok: z.boolean(),
      firstBrokenSequence: z.string().nullable(),
      gaps: z.array(z.string()),
    }),
    checkpoints: z.object({ ok: z.boolean() }),
  }),
});

const exportResponse = z.object({
  data: z.object({
    contentType: z.string(),
    rowCount: z.number(),
    truncated: z.boolean(),
    content: z.string(),
  }),
});

const errorResponse = z.object({ error: z.object({ message: z.string() }) });

interface Props {
  /** Chain to verify: a company id or "platform". */
  chainKey: string;
  /** Current filter query string (without format), used by the export. */
  filterQuery: string;
}

type Notice = { kind: 'success' | 'error' | 'info'; text: string } | null;

async function messageOf(response: Response): Promise<string> {
  const parsed = errorResponse.safeParse(await response.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : t('s01Core.states.errorBody');
}

export function AuditToolbar({ chainKey, filterQuery }: Props): JSX.Element {
  const [busy, setBusy] = useState<'verify' | 'export' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [format, setFormat] = useState<'csv' | 'json' | 'cef'>('csv');

  async function verify(): Promise<void> {
    setBusy('verify');
    setNotice(null);
    try {
      const response = await fetch('/api/admin/audit/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chainKey }),
      });
      if (!response.ok) {
        setNotice({ kind: 'error', text: await messageOf(response) });
        return;
      }
      const { data } = verifyResponse.parse(await response.json());
      if (data.chain.ok && data.checkpoints.ok) {
        setNotice({ kind: 'success', text: t('s02Governance.audit.verifyOk') });
      } else {
        const parts: string[] = [];
        if (data.chain.firstBrokenSequence !== null) {
          parts.push(
            t('s02Governance.audit.verifyBroken', { sequence: data.chain.firstBrokenSequence }),
          );
        }
        if (data.chain.gaps.length > 0) {
          parts.push(t('s02Governance.audit.verifyGaps', { gaps: data.chain.gaps.join(', ') }));
        }
        if (!data.checkpoints.ok) parts.push(t('s02Governance.audit.verifyBadCheckpoint'));
        setNotice({ kind: 'error', text: parts.join(' ') });
      }
    } catch {
      setNotice({ kind: 'error', text: t('s01Core.states.errorBody') });
    } finally {
      setBusy(null);
    }
  }

  async function exportRows(): Promise<void> {
    setBusy('export');
    setNotice(null);
    try {
      const params = new URLSearchParams(filterQuery);
      params.set('format', format);
      const response = await fetch(`/api/admin/audit/export?${params.toString()}`);
      if (!response.ok) {
        setNotice({ kind: 'error', text: await messageOf(response) });
        return;
      }
      const { data } = exportResponse.parse(await response.json());
      const blob = new Blob([data.content], { type: data.contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-log.${format === 'json' ? 'jsonl' : format === 'cef' ? 'cef' : 'csv'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      if (data.truncated) {
        setNotice({
          kind: 'info',
          text: t('s02Governance.audit.exportTruncated', { count: data.rowCount }),
        });
      }
    } catch {
      setNotice({ kind: 'error', text: t('s01Core.states.errorBody') });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-sp-12">
      <div className="flex flex-wrap items-center gap-sp-12">
        <Button type="button" variant="outline" onClick={verify} disabled={busy !== null}>
          {busy === 'verify' ? t('s02Governance.audit.verifying') : t('s02Governance.audit.verify')}
        </Button>
        <NativeSelect
          aria-label={t('s02Governance.audit.export')}
          value={format}
          onChange={(event) => setFormat(event.target.value as 'csv' | 'json' | 'cef')}
          className="w-auto"
        >
          <option value="csv">{t('s02Governance.audit.formatCsv')}</option>
          <option value="json">{t('s02Governance.audit.formatJson')}</option>
          <option value="cef">{t('s02Governance.audit.formatCef')}</option>
        </NativeSelect>
        <Button type="button" onClick={exportRows} disabled={busy !== null}>
          {busy === 'export' ? t('s02Governance.audit.exporting') : t('s02Governance.audit.export')}
        </Button>
      </div>
      <div aria-live="polite">
        {notice ? (
          <Alert
            variant={
              notice.kind === 'success'
                ? 'success'
                : notice.kind === 'error'
                  ? 'destructive'
                  : 'info'
            }
          >
            {notice.kind === 'success' ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            )}
            <div>{notice.text}</div>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
