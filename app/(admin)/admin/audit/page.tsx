// path: app/(admin)/admin/audit/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuditToolbar } from '@/components/admin/audit/audit-toolbar';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';
import { createServerSupabase } from '@/lib/supabase/server';
import { auditSearchSchema, searchAudit, type AuditPage } from '@/services/audit/search';
import { requirePagePermission } from '@/services/base/page-guard';
import type { AuditExportRow } from '@/lib/compliance/audit-export';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Audit log' };

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

const columns: readonly DataColumn<AuditExportRow>[] = [
  {
    key: 'time',
    header: t('s02Governance.audit.colTime'),
    cell: (r) => (
      <time dateTime={r.createdAt}>{r.createdAt.replace('T', ' ').slice(0, 19)} UTC</time>
    ),
  },
  { key: 'sequence', header: t('s02Governance.audit.colSequence'), cell: (r) => r.sequence },
  {
    key: 'action',
    header: t('s02Governance.audit.colAction'),
    primary: true,
    cell: (r) => <span className="font-mono text-sm">{r.action}</span>,
  },
  {
    key: 'actor',
    header: t('s02Governance.audit.colActor'),
    cell: (r) => r.actorRole ?? t('s02Governance.audit.system'),
  },
  {
    key: 'resource',
    header: t('s02Governance.audit.colResource'),
    cell: (r) => (
      <span className="break-all font-mono text-xs">
        {r.resourceId ? `${r.resourceType}/${r.resourceId}` : r.resourceType}
      </span>
    ),
  },
  {
    key: 'address',
    header: t('s02Governance.audit.colAddress'),
    cell: (r) => r.ipMasked ?? '-',
    hideOnMobile: true,
  },
  {
    key: 'hash',
    header: t('s02Governance.audit.colHash'),
    cell: (r) => <span className="font-mono text-xs">{r.entryHash.slice(0, 12)}</span>,
    hideOnMobile: true,
  },
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('audit.read', 'platform', 'audit_log');
  const raw = await searchParams;
  const parsed = auditSearchSchema.safeParse({
    action: firstValue(raw.action),
    resourceType: firstValue(raw.resourceType),
    from: firstValue(raw.from),
    to: firstValue(raw.to),
    cursor: firstValue(raw.cursor) ?? null,
  });

  const filterParams = new URLSearchParams();
  let page: AuditPage | null = null;
  if (parsed.success) {
    for (const key of ['action', 'resourceType', 'from', 'to'] as const) {
      const value = parsed.data[key];
      if (value) filterParams.set(key, value);
    }
    try {
      page = await searchAudit(await createServerSupabase(), parsed.data);
    } catch {
      page = null;
    }
  }

  let body: JSX.Element;
  if (page === null) {
    body = <ErrorState description={t('s02Governance.audit.loadError')} />;
  } else {
    const next = new URLSearchParams(filterParams);
    if (page.nextCursor) next.set('cursor', page.nextCursor);
    body = (
      <div className="space-y-sp-16">
        <DataTable
          columns={columns}
          rows={page.items}
          getRowId={(r) => r.id}
          caption={t('s02Governance.audit.table')}
          empty={
            <EmptyState
              title={t('s02Governance.audit.emptyTitle')}
              description={t('s02Governance.audit.emptyBody')}
            />
          }
        />
        {page.nextCursor ? (
          <Button asChild variant="outline">
            <Link href={`/admin/audit?${next.toString()}`}>{t('s02Governance.audit.older')}</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s02Governance.audit.title')}
        description={t('s02Governance.audit.description')}
      />
      <form method="get" className="grid gap-sp-12 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <div className="space-y-1">
          <Label htmlFor="audit-action">{t('s02Governance.audit.filterAction')}</Label>
          <Input
            id="audit-action"
            name="action"
            defaultValue={filterParams.get('action') ?? ''}
            maxLength={100}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-resource">{t('s02Governance.audit.filterResource')}</Label>
          <Input
            id="audit-resource"
            name="resourceType"
            defaultValue={filterParams.get('resourceType') ?? ''}
            maxLength={100}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-from">{t('s02Governance.audit.filterFrom')}</Label>
          <Input
            id="audit-from"
            name="from"
            placeholder="2026-01-01T00:00:00Z"
            defaultValue={filterParams.get('from') ?? ''}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="audit-to">{t('s02Governance.audit.filterTo')}</Label>
          <Input
            id="audit-to"
            name="to"
            placeholder="2026-12-31T23:59:59Z"
            defaultValue={filterParams.get('to') ?? ''}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit">{t('s02Governance.audit.apply')}</Button>
          <Button asChild variant="ghost">
            <Link href="/admin/audit">{t('s02Governance.audit.reset')}</Link>
          </Button>
        </div>
      </form>
      <AuditToolbar
        chainKey={actor.companyId ?? 'platform'}
        filterQuery={filterParams.toString()}
      />
      {body}
    </div>
  );
}
