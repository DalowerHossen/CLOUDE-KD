// path: app/(admin)/admin/siem/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { siemOverview, type SiemOverview } from '@/services/siem/siem-service';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { DestinationForm, IocForm, RowActions } from './_components/siem-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'SIEM' };

type Destination = SiemOverview['destinations'][number];
type Ioc = SiemOverview['iocs'][number];
type Finding = SiemOverview['findings'][number];

const severityBadge = (s: string): JSX.Element => (
  <Badge
    variant={
      s === 'critical' || s === 'high' ? 'destructive' : s === 'medium' ? 'warning' : 'outline'
    }
  >
    {s}
  </Badge>
);

const destinationColumns: readonly DataColumn<Destination>[] = [
  { key: 'name', header: t('s04Security.siem.name'), primary: true, cell: (r) => r.name },
  { key: 'kind', header: t('s04Security.siem.kind'), cell: (r) => r.kind },
  {
    key: 'endpoint',
    header: t('s04Security.siem.endpoint'),
    hideOnMobile: true,
    cell: (r) => <span className="break-all text-xs">{r.endpoint}</span>,
  },
  {
    key: 'state',
    header: t('s04Security.siem.state'),
    cell: (r) =>
      r.lastError ? (
        <Badge variant="destructive">{t('s04Security.siem.failing', { count: r.failures })}</Badge>
      ) : (
        <Badge variant={r.enabled ? 'outline' : 'secondary'}>
          {r.enabled ? t('s04Security.siem.active') : t('s04Security.siem.paused')}
        </Badge>
      ),
  },
  {
    key: 'last',
    header: t('s04Security.siem.lastSuccess'),
    hideOnMobile: true,
    cell: (r) => (r.lastSuccessAt ? r.lastSuccessAt.replace('T', ' ').slice(0, 19) : '-'),
  },
  {
    key: 'x',
    header: '',
    cell: (r) => <RowActions kind="destination" id={r.id} enabled={r.enabled} />,
  },
];
const iocColumns: readonly DataColumn<Ioc>[] = [
  { key: 'type', header: t('s04Security.siem.iocType'), primary: true, cell: (r) => r.type },
  {
    key: 'value',
    header: t('s04Security.siem.iocValue'),
    cell: (r) => <span className="font-mono text-xs">{r.valueShort}</span>,
  },
  {
    key: 'source',
    header: t('s04Security.siem.iocSource'),
    hideOnMobile: true,
    cell: (r) => r.source,
  },
  { key: 'sev', header: t('s04Security.siem.severity'), cell: (r) => severityBadge(r.severity) },
  { key: 'x', header: '', cell: (r) => <RowActions kind="ioc" id={r.id} /> },
];
const findingColumns: readonly DataColumn<Finding>[] = [
  {
    key: 'rule',
    header: t('s04Security.siem.rule'),
    primary: true,
    cell: (r) => <span className="font-mono text-sm">{r.ruleId}</span>,
  },
  { key: 'sev', header: t('s04Security.siem.severity'), cell: (r) => severityBadge(r.severity) },
  {
    key: 'subject',
    header: t('s04Security.siem.subject'),
    hideOnMobile: true,
    cell: (r) => <span className="font-mono text-xs">{r.subject}</span>,
  },
  { key: 'count', header: t('s04Security.siem.events'), cell: (r) => r.count },
  {
    key: 'last',
    header: t('s04Security.siem.lastEvent'),
    hideOnMobile: true,
    cell: (r) => r.lastAt.replace('T', ' ').slice(0, 19),
  },
  { key: 'status', header: t('s04Security.siem.state'), cell: (r) => r.status },
  { key: 'x', header: '', cell: (r) => <RowActions kind="finding" id={r.id} /> },
];

export default async function SiemPage(): Promise<JSX.Element> {
  await requirePagePermission('siem.read', 'platform', 'siem');
  let data: SiemOverview | null;
  try {
    data = await siemOverview();
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s04Security.siem.title')}
        description={t('s04Security.siem.description')}
      />
      <StepUpForm />
      {data === null ? (
        <ErrorState description={t('s04Security.siem.loadError')} />
      ) : (
        <>
          <section className="space-y-sp-12" aria-labelledby="findings-title">
            <h2 id="findings-title" className="text-h3 font-semibold">
              {t('s04Security.siem.findingsTitle')}
            </h2>
            <DataTable
              columns={findingColumns}
              rows={data.findings}
              getRowId={(r) => r.id}
              caption={t('s04Security.siem.findingsTitle')}
              empty={<EmptyState title={t('s04Security.siem.emptyFindings')} />}
            />
          </section>
          <section className="space-y-sp-12" aria-labelledby="dest-title">
            <h2 id="dest-title" className="text-h3 font-semibold">
              {t('s04Security.siem.destinationsTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t('s04Security.siem.destinationsHelp')}
            </p>
            <DataTable
              columns={destinationColumns}
              rows={data.destinations}
              getRowId={(r) => r.id}
              caption={t('s04Security.siem.destinationsTitle')}
              empty={<EmptyState title={t('s04Security.siem.emptyDestinations')} />}
            />
            <DestinationForm />
          </section>
          <section className="space-y-sp-12" aria-labelledby="ioc-title">
            <h2 id="ioc-title" className="text-h3 font-semibold">
              {t('s04Security.siem.iocTitle')}
            </h2>
            <DataTable
              columns={iocColumns}
              rows={data.iocs}
              getRowId={(r) => r.id}
              caption={t('s04Security.siem.iocTitle')}
              empty={<EmptyState title={t('s04Security.siem.emptyIocs')} />}
            />
            <IocForm />
          </section>
          <section className="space-y-sp-12" aria-labelledby="rules-title">
            <h2 id="rules-title" className="text-h3 font-semibold">
              {t('s04Security.siem.rulesTitle')}
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {data.rules.map((r) => (
                <li key={r.id}>
                  <span className="font-mono">{r.id}</span>: {r.title} ({r.threshold} in{' '}
                  {r.windowMinutes} min)
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
