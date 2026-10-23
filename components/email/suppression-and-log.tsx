// path: components/email/suppression-and-log.tsx
'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ message: z.string() }) });

export interface Suppression {
  id: string;
  email: string;
  reason: string;
  note: string | null;
  createdAt: string;
}
export interface LogRow {
  id: string;
  to: string;
  template: string;
  subject: string;
  status: string;
  delivery: string;
  createdAt: string;
  error: string | null;
}

export function SuppressionList({
  endpoint,
  rows,
}: {
  endpoint: string;
  rows: Suppression[];
}): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function act(body: unknown): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        router.refresh();
        return true;
      }
      const parsed = errorBody.safeParse(await response.json().catch(() => null));
      setMessage(parsed.success ? parsed.data.error.message : t('s05Storage.email.genericError'));
    } catch {
      setMessage(t('s05Storage.email.genericError'));
    } finally {
      setBusy(false);
    }
    return false;
  }

  async function add(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    if (
      await act({
        action: 'suppress',
        email: String(new FormData(form).get('email') ?? '').trim(),
        note: '',
      })
    )
      form.reset();
  }

  const columns: readonly DataColumn<Suppression>[] = [
    {
      key: 'email',
      header: t('s05Storage.email.suppressEmail'),
      primary: true,
      cell: (r) => r.email,
    },
    {
      key: 'reason',
      header: t('s05Storage.email.colStatus'),
      cell: (r) => <Badge variant="outline">{r.reason}</Badge>,
    },
    {
      key: 'time',
      header: t('s05Storage.email.colTime'),
      hideOnMobile: true,
      cell: (r) => r.createdAt.replace('T', ' ').slice(0, 19),
    },
    {
      key: 'x',
      header: '',
      cell: (r) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => act({ action: 'unsuppress', id: r.id })}
        >
          {t('s05Storage.email.unsuppress')}
        </Button>
      ),
    },
  ];
  return (
    <div className="space-y-sp-12">
      <p className="text-sm text-muted-foreground">{t('s05Storage.email.suppressionsHelp')}</p>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        caption={t('s05Storage.email.suppressionsTitle')}
        empty={<EmptyState title={t('s05Storage.email.suppressionsEmpty')} />}
      />
      <form
        onSubmit={add}
        className="flex flex-wrap items-end gap-2"
        aria-label={t('s05Storage.email.suppressAdd')}
      >
        <label className="space-y-1 text-sm">
          <span>{t('s05Storage.email.suppressEmail')}</span>
          <Input name="email" type="email" required maxLength={254} />
        </label>
        <Button type="submit" variant="outline" disabled={busy}>
          {t('s05Storage.email.suppressAdd')}
        </Button>
      </form>
      <p aria-live="polite" className="text-sm text-destructive">
        {message}
      </p>
    </div>
  );
}

export function MessageLog({ rows }: { rows: LogRow[] }): JSX.Element {
  const columns: readonly DataColumn<LogRow>[] = [
    { key: 'to', header: t('s05Storage.email.colTo'), primary: true, cell: (r) => r.to },
    {
      key: 'tpl',
      header: t('s05Storage.email.colTemplate'),
      hideOnMobile: true,
      cell: (r) => <span title={r.subject}>{r.template}</span>,
    },
    {
      key: 'status',
      header: t('s05Storage.email.colStatus'),
      cell: (r) => (
        <Badge
          variant={
            r.status === 'failed' ? 'destructive' : r.status === 'sent' ? 'outline' : 'secondary'
          }
          title={r.error ?? undefined}
        >
          {r.status === 'sent' && r.delivery !== 'none' && r.delivery !== 'sent'
            ? r.delivery
            : r.status}
        </Badge>
      ),
    },
    {
      key: 'time',
      header: t('s05Storage.email.colTime'),
      hideOnMobile: true,
      cell: (r) => r.createdAt.replace('T', ' ').slice(0, 19),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
      caption={t('s05Storage.email.logTitle')}
      empty={<EmptyState title={t('s05Storage.email.logEmpty')} />}
    />
  );
}
