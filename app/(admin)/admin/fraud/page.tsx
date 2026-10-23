// path: app/(admin)/admin/fraud/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import type { AdaptiveAction } from '@/lib/security/risk-scoring';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { fraudOverview, type FraudOverview } from '@/services/fraud/admin-ops';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { FraudActions } from './_components/fraud-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Fraud and risk' };

type Risk = FraudOverview['risks'][number];
type Signal = FraudOverview['signals'][number];

const ACTION_LABEL: Record<AdaptiveAction, StringKey> = {
  allow: 's04Security.fraud.actionAllow',
  monitor: 's04Security.fraud.actionMonitor',
  step_up: 's04Security.fraud.actionStepUp',
  hold: 's04Security.fraud.actionHold',
  block: 's04Security.fraud.actionBlock',
};

const short = (ref: string): string => (ref.length > 20 ? `${ref.slice(0, 12)}...` : ref);

const riskColumns: readonly DataColumn<Risk>[] = [
  {
    key: 'subject',
    header: t('s04Security.fraud.colSubject'),
    primary: true,
    cell: (r) => <span className="font-mono text-xs">{short(r.ref)}</span>,
  },
  { key: 'kind', header: t('s04Security.fraud.colKind'), cell: (r) => r.subjectType },
  {
    key: 'score',
    header: t('s04Security.fraud.colScore'),
    cell: (r) => (
      <Badge variant={r.score >= 80 ? 'destructive' : r.score >= 60 ? 'warning' : 'outline'}>
        {r.score.toFixed(0)}
      </Badge>
    ),
  },
  {
    key: 'action',
    header: t('s04Security.fraud.colAction'),
    cell: (r) => t(ACTION_LABEL[r.action]),
  },
  {
    key: 'factors',
    header: t('s04Security.fraud.colFactors'),
    hideOnMobile: true,
    cell: (r) =>
      Object.entries(r.factors)
        .map(([k, v]) => `${k} x${v}`)
        .join(', '),
  },
  {
    key: 'x',
    header: '',
    cell: (r) => <FraudActions subjectType={r.subjectType} refValue={r.ref} />,
  },
];
const signalColumns: readonly DataColumn<Signal>[] = [
  {
    key: 'time',
    header: t('s04Security.fraud.colTime'),
    cell: (r) => r.createdAt.replace('T', ' ').slice(0, 19),
  },
  {
    key: 'type',
    header: t('s04Security.fraud.colSignal'),
    primary: true,
    cell: (r) => <span className="font-mono text-sm">{r.type}</span>,
  },
  {
    key: 'subject',
    header: t('s04Security.fraud.colSubject'),
    hideOnMobile: true,
    cell: (r) => `${r.subjectType}: ${short(r.ref)}`,
  },
  { key: 'delta', header: t('s04Security.fraud.colDelta'), cell: (r) => r.delta },
];

export default async function FraudPage(): Promise<JSX.Element> {
  await requirePagePermission('fraud.read', 'platform', 'fraud');
  let data: FraudOverview | null;
  try {
    data = await fraudOverview();
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s04Security.fraud.title')}
        description={t('s04Security.fraud.description')}
      />
      <StepUpForm />
      {data === null ? (
        <ErrorState description={t('s04Security.fraud.loadError')} />
      ) : (
        <>
          <section className="space-y-sp-12" aria-labelledby="risk-title">
            <h2 id="risk-title" className="text-h3 font-semibold">
              {t('s04Security.fraud.risksTitle')}
            </h2>
            <DataTable
              columns={riskColumns}
              rows={data.risks}
              getRowId={(r) => r.id}
              caption={t('s04Security.fraud.risksCaption')}
              empty={<EmptyState title={t('s04Security.fraud.emptyRisks')} />}
            />
          </section>
          <section className="space-y-sp-12" aria-labelledby="sig-title">
            <h2 id="sig-title" className="text-h3 font-semibold">
              {t('s04Security.fraud.signalsTitle')}
            </h2>
            <DataTable
              columns={signalColumns}
              rows={data.signals}
              getRowId={(r) => r.id}
              caption={t('s04Security.fraud.signalsCaption')}
              empty={<EmptyState title={t('s04Security.fraud.emptySignals')} />}
            />
          </section>
        </>
      )}
    </div>
  );
}
