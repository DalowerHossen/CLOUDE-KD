// path: app/(dashboard)/projects/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { PROJECT_STATUSES } from '@/lib/project/input';
import { requirePagePermission } from '@/services/base/page-guard';
import { listProjects, type ProjectView } from '@/services/project/projects';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Projects' };

const columns: readonly DataColumn<ProjectView>[] = [
  {
    key: 'name',
    header: t('s09Projects.columns.name'),
    primary: true,
    cell: (r) => (r.code ? `${r.code} - ${r.name}` : r.name),
  },
  { key: 'client', header: t('s09Projects.columns.client'), cell: (r) => r.clientName || '-' },
  {
    key: 'billing',
    header: t('s09Projects.columns.billing'),
    hideOnMobile: true,
    cell: (r) => t(`s09Projects.billing.${r.billingType}` as StringKey),
  },
  {
    key: 'status',
    header: t('s09Projects.columns.status'),
    cell: (r) => (
      <Badge variant="outline">{t(`s09Projects.statuses.${r.status}` as StringKey)}</Badge>
    ),
  },
  {
    key: 'open',
    header: '',
    cell: (r) => (
      <Link className="underline" href={`/projects/${r.id}`}>
        {t('s09Invoicing.invoices.open')}
      </Link>
    ),
  },
];

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('project.read', 'tenant', 'project');
  const raw = await searchParams;
  const one = (k: string): string => {
    const v = raw[k];
    return (Array.isArray(v) ? v[0] : v) ?? '';
  };
  const status = PROJECT_STATUSES.find((s) => s === one('status'));
  const q = one('q').slice(0, 80);
  let rows: ProjectView[] | null;
  try {
    rows = await listProjects(actor.companyId as string, { status, q, limit: 200 });
  } catch {
    rows = null;
  }
  const canManage = await getService('permissions').can(actor, 'project.manage', {
    type: 'project',
  });
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s09Projects.title')}
        description={t('s09Projects.description')}
        actions={
          <>
            <Link className="underline" href="/timesheets">
              {t('s09Projects.nav.timesheets')}
            </Link>
            {canManage ? (
              <Link className="underline" href="/projects/new">
                {t('s09Projects.newProject')}
              </Link>
            ) : null}
          </>
        }
      />
      <form
        action="/projects"
        method="get"
        role="search"
        className="grid gap-sp-8 rounded-lg border bg-card p-sp-12 text-sm sm:grid-cols-3"
      >
        <label className="sm:col-span-2">
          <span className="sr-only">{t('s09Projects.searchPlaceholder')}</span>
          <Input
            name="q"
            defaultValue={q}
            maxLength={80}
            placeholder={t('s09Projects.searchPlaceholder')}
          />
        </label>
        <NativeSelect
          name="status"
          defaultValue={status ?? ''}
          aria-label={t('s09Projects.columns.status')}
        >
          <option value="">{t('s09Projects.allStatuses')}</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`s09Projects.statuses.${s}` as StringKey)}
            </option>
          ))}
        </NativeSelect>
      </form>
      {rows === null ? (
        <ErrorState description={t('s09Invoicing.invoices.loadError')} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          caption={t('s09Projects.title')}
          empty={<EmptyState title={t('s09Projects.empty')} />}
        />
      )}
    </div>
  );
}
