// path: app/(admin)/admin/alerts/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { alertsOverview, type AlertsOverview } from '@/services/alerting/alert-service';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import {
  AlertButtons,
  ChannelForm,
  OncallForm,
  RemoveButton,
  SilenceForm,
} from './_components/alert-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Alerts' };

type Alert = AlertsOverview['alerts'][number];
type Silence = AlertsOverview['silences'][number];
type Channel = AlertsOverview['channels'][number];
type Person = AlertsOverview['roster'][number];

const sev = (s: string): JSX.Element => (
  <Badge
    variant={
      s === 'critical' || s === 'high' ? 'destructive' : s === 'medium' ? 'warning' : 'outline'
    }
  >
    {s}
  </Badge>
);
const utc = (v: string): string => v.replace('T', ' ').slice(0, 19);

const alertColumns: readonly DataColumn<Alert>[] = [
  { key: 'title', header: t('s04Security.alerts.title'), primary: true, cell: (r) => r.title },
  { key: 'sev', header: t('s04Security.alerts.severity'), cell: (r) => sev(r.severity) },
  { key: 'status', header: t('s04Security.alerts.status'), cell: (r) => r.status },
  {
    key: 'count',
    header: t('s04Security.alerts.occurrences'),
    hideOnMobile: true,
    cell: (r) => r.occurrences,
  },
  { key: 'level', header: t('s04Security.alerts.level'), hideOnMobile: true, cell: (r) => r.level },
  {
    key: 'last',
    header: t('s04Security.alerts.lastAt'),
    hideOnMobile: true,
    cell: (r) => utc(r.lastAt),
  },
  {
    key: 'x',
    header: '',
    cell: (r) => (r.status === 'resolved' ? null : <AlertButtons id={r.id} status={r.status} />),
  },
];
const silenceColumns: readonly DataColumn<Silence>[] = [
  {
    key: 'rule',
    header: t('s04Security.alerts.rule'),
    primary: true,
    cell: (r) => <span className="font-mono text-sm">{r.ruleId}</span>,
  },
  { key: 'reason', header: t('s04Security.alerts.reason'), cell: (r) => r.reason },
  { key: 'ends', header: t('s04Security.alerts.endsAt'), cell: (r) => utc(r.endsAt) },
  {
    key: 'x',
    header: '',
    cell: (r) => (
      <RemoveButton action="delete_silence" id={r.id} label={t('s04Security.alerts.remove')} />
    ),
  },
];
const channelColumns: readonly DataColumn<Channel>[] = [
  { key: 'name', header: t('s04Security.alerts.name'), primary: true, cell: (r) => r.name },
  { key: 'kind', header: t('s04Security.alerts.kind'), cell: (r) => r.kind },
  {
    key: 'target',
    header: t('s04Security.alerts.target'),
    hideOnMobile: true,
    cell: (r) => <span className="text-xs">{r.target}</span>,
  },
  { key: 'min', header: t('s04Security.alerts.minSeverity'), cell: (r) => sev(r.minSeverity) },
  {
    key: 'from',
    header: t('s04Security.alerts.fromLevel'),
    hideOnMobile: true,
    cell: (r) => r.fromLevel,
  },
  {
    key: 'x',
    header: '',
    cell: (r) => (
      <div className="flex gap-2">
        <RemoveButton action="test_channel" id={r.id} label={t('s04Security.alerts.test')} />
        <RemoveButton action="delete_channel" id={r.id} label={t('s04Security.alerts.remove')} />
      </div>
    ),
  },
];
const rosterColumns: readonly DataColumn<Person>[] = [
  { key: 'name', header: t('s04Security.alerts.name'), primary: true, cell: (r) => r.name },
  { key: 'email', header: t('s04Security.alerts.email'), cell: (r) => r.email },
  { key: 'level', header: t('s04Security.alerts.level'), cell: (r) => r.level },
  {
    key: 'x',
    header: '',
    cell: (r) => (
      <RemoveButton action="remove_oncall" id={r.id} label={t('s04Security.alerts.remove')} />
    ),
  },
];

function Section(props: {
  id: string;
  title: string;
  help?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="space-y-sp-12" aria-labelledby={props.id}>
      <h2 id={props.id} className="text-h3 font-semibold">
        {props.title}
      </h2>
      {props.help ? <p className="text-sm text-muted-foreground">{props.help}</p> : null}
      {props.children}
    </section>
  );
}

export default async function AlertsPage(): Promise<JSX.Element> {
  await requirePagePermission('alert.read', 'platform', 'alert');
  let data: AlertsOverview | null;
  try {
    data = await alertsOverview();
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s04Security.alerts.pageTitle')}
        description={t('s04Security.alerts.description')}
      />
      <StepUpForm />
      {data === null ? (
        <ErrorState description={t('s04Security.alerts.loadError')} />
      ) : (
        <>
          <Section id="alerts-open" title={t('s04Security.alerts.alertsTitle')}>
            <DataTable
              columns={alertColumns}
              rows={data.alerts}
              getRowId={(r) => r.id}
              caption={t('s04Security.alerts.alertsTitle')}
              empty={<EmptyState title={t('s04Security.alerts.emptyAlerts')} />}
            />
          </Section>
          <Section
            id="alerts-silences"
            title={t('s04Security.alerts.silencesTitle')}
            help={t('s04Security.alerts.silencesHelp')}
          >
            <DataTable
              columns={silenceColumns}
              rows={data.silences}
              getRowId={(r) => r.id}
              caption={t('s04Security.alerts.silencesTitle')}
              empty={<EmptyState title={t('s04Security.alerts.emptySilences')} />}
            />
            <SilenceForm />
          </Section>
          <Section
            id="alerts-channels"
            title={t('s04Security.alerts.channelsTitle')}
            help={t('s04Security.alerts.channelsHelp')}
          >
            <DataTable
              columns={channelColumns}
              rows={data.channels}
              getRowId={(r) => r.id}
              caption={t('s04Security.alerts.channelsTitle')}
              empty={<EmptyState title={t('s04Security.alerts.emptyChannels')} />}
            />
            <ChannelForm />
          </Section>
          <Section
            id="alerts-roster"
            title={t('s04Security.alerts.rosterTitle')}
            help={t('s04Security.alerts.rosterHelp')}
          >
            <DataTable
              columns={rosterColumns}
              rows={data.roster}
              getRowId={(r) => r.id}
              caption={t('s04Security.alerts.rosterTitle')}
              empty={<EmptyState title={t('s04Security.alerts.emptyRoster')} />}
            />
            <OncallForm />
          </Section>
        </>
      )}
    </div>
  );
}
