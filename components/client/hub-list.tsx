// path: components/client/hub-list.tsx
'use client';
import { useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';

export interface HubListRow {
  id: string;
  number: string;
  status: string;
  issueDate: string;
  dueDate: string;
  total: string;
  balance: string;
  late: boolean;
}

type Filter = 'all' | 'open' | 'overdue' | 'paid';

function matches(row: HubListRow, filter: Filter): boolean {
  if (filter === 'open') return row.status !== 'paid';
  if (filter === 'paid') return row.status === 'paid';
  if (filter === 'overdue') return row.status === 'overdue' || row.late;
  return true;
}

/** The invoices of one client: filter, search by number, and open one (a short-lived invoice link is made on demand). */
export function HubList({ token, rows }: { token: string; rows: HubListRow[] }): JSX.Element {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (r) => matches(r, filter) && (needle === '' || r.number.toLowerCase().includes(needle)),
    );
  }, [rows, filter, query]);

  async function open(invoiceId: string): Promise<void> {
    setBusy(invoiceId);
    setFailed(false);
    try {
      const response = await fetch('/api/portal/hub/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, invoiceId }),
        cache: 'no-store',
      });
      const json: unknown = await response.json();
      const path = (json as { data?: { path?: unknown } }).data?.path;
      if (response.ok && typeof path === 'string' && /^\/i\/[A-Za-z0-9_.-]+$/.test(path)) {
        window.location.assign(path);
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    }
    setBusy(null);
  }

  return (
    <section className="space-y-sp-12" aria-label={t('s13Portal.hub.listLabel')}>
      <div className="flex flex-col gap-sp-8 sm:flex-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('s13Portal.hub.search')}
          aria-label={t('s13Portal.hub.search')}
          maxLength={40}
        />
        <NativeSelect
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          aria-label={t('s13Portal.hub.filter')}
        >
          <option value="all">{t('s13Portal.hub.filterAll')}</option>
          <option value="open">{t('s13Portal.hub.filterOpen')}</option>
          <option value="overdue">{t('s13Portal.hub.filterOverdue')}</option>
          <option value="paid">{t('s13Portal.hub.filterPaid')}</option>
        </NativeSelect>
      </div>
      {failed ? <Alert variant="destructive">{t('s13Portal.hub.openFailed')}</Alert> : null}
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s13Portal.hub.empty')}</p>
      ) : (
        <ul className="space-y-sp-8">
          {shown.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-sp-8 rounded-md border p-sp-12"
            >
              <div className="space-y-1">
                <p className="font-semibold">{row.number}</p>
                <p className="text-caption text-muted-foreground">
                  {t('s13Portal.hub.due', { date: row.dueDate })}
                </p>
              </div>
              <div className="text-right text-sm tabular-nums">
                <p>USD {row.total}</p>
                {row.status !== 'paid' ? (
                  <p className="text-caption text-muted-foreground">
                    {t('s13Portal.hub.balance', { amount: row.balance })}
                  </p>
                ) : null}
              </div>
              <Badge
                variant={row.status === 'paid' ? 'success' : row.late ? 'destructive' : 'info'}
              >
                {row.status === 'paid'
                  ? t('s13Portal.invoice.statusPaid')
                  : row.late
                    ? t('s13Portal.invoice.statusOverdue')
                    : t('s13Portal.hub.statusOpen')}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => void open(row.id)}
              >
                {t('s13Portal.hub.open')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
