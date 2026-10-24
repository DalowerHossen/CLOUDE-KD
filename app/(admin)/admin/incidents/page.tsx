// path: app/(admin)/admin/incidents/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import {
  POSTMORTEM_TEMPLATE,
  incidentOverview,
  type IncidentOverview,
} from '@/services/incident/incident-service';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { ManageIncident, OpenIncidentForm } from './_components/incident-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Incidents' };

const minutes = (v: number | null): string => (v === null ? '-' : `${v} min`);
const utc = (v: string): string => v.replace('T', ' ').slice(0, 19);

export default async function IncidentsPage(): Promise<JSX.Element> {
  await requirePagePermission('incident.read', 'platform', 'incident');
  let data: IncidentOverview | null;
  try {
    data = await incidentOverview();
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s04Security.incidents.pageTitle')}
        description={t('s04Security.incidents.description')}
      />
      <StepUpForm />
      {data === null ? (
        <ErrorState description={t('s04Security.incidents.loadError')} />
      ) : (
        <>
          <section
            aria-label={t('s04Security.incidents.metricsTitle')}
            className="grid gap-sp-12 sm:grid-cols-4"
          >
            {[
              [t('s04Security.incidents.open90'), String(data.metrics.open)],
              [t('s04Security.incidents.mttd'), minutes(data.metrics.mttd)],
              [t('s04Security.incidents.mtta'), minutes(data.metrics.mtta)],
              [t('s04Security.incidents.mttr'), minutes(data.metrics.mttr)],
            ].map(([label, value]) => (
              <Card key={label}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{value}</CardContent>
              </Card>
            ))}
          </section>
          <section className="space-y-sp-12" aria-labelledby="incident-list">
            <h2 id="incident-list" className="text-h3 font-semibold">
              {t('s04Security.incidents.listTitle')}
            </h2>
            {data.incidents.length === 0 ? (
              <EmptyState title={t('s04Security.incidents.empty')} />
            ) : null}
            {data.incidents.map((i) => (
              <Card key={i.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                    <Badge
                      variant={
                        i.severity === 'SEV1' || i.severity === 'SEV2' ? 'destructive' : 'warning'
                      }
                    >
                      {i.severity}
                    </Badge>
                    <span>
                      #{i.number} {i.title}
                    </span>
                    <Badge variant="outline">{i.status}</Badge>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t('s04Security.incidents.detectedAt', { time: utc(i.detectedAt) })}
                  </p>
                </CardHeader>
                <CardContent className="space-y-sp-12">
                  <ol
                    className="space-y-1 text-sm"
                    aria-label={t('s04Security.incidents.timeline')}
                  >
                    {i.timeline.map((e) => (
                      <li key={e.id}>
                        <span className="font-mono text-xs text-muted-foreground">{utc(e.at)}</span>{' '}
                        {e.kind}: {e.body}
                      </li>
                    ))}
                  </ol>
                  <ManageIncident
                    id={i.id}
                    status={i.status}
                    version={i.version}
                    summary={i.summary}
                    impact={i.impact}
                    rootCause={i.rootCause}
                    postmortem={i.postmortem}
                    template={POSTMORTEM_TEMPLATE}
                  />
                </CardContent>
              </Card>
            ))}
          </section>
          <section className="space-y-sp-12" aria-labelledby="incident-open">
            <h2 id="incident-open" className="text-h3 font-semibold">
              {t('s04Security.incidents.open')}
            </h2>
            <OpenIncidentForm />
          </section>
        </>
      )}
    </div>
  );
}
