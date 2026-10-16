// path: app/(admin)/admin/health/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { healthReport, type HealthReport } from '@/services/monitoring/health';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'System health' };

export default async function HealthPage(): Promise<JSX.Element> {
  await requirePagePermission('security.read', 'platform', 'health');
  let data: HealthReport | null;
  try {
    data = await healthReport();
  } catch {
    data = null;
  }
  const cards: [string, string, boolean][] = data
    ? [
        [
          t('s04Security.health.database'),
          data.database.ok
            ? t('s04Security.health.dbOk', { ms: data.database.latencyMs })
            : t('s04Security.health.dbDown'),
          data.database.ok,
        ],
        [
          t('s04Security.health.alertsCritical'),
          String(data.alertsOpen.critical),
          data.alertsOpen.critical === 0,
        ],
        [
          t('s04Security.health.alertsHigh'),
          String(data.alertsOpen.high),
          data.alertsOpen.high === 0,
        ],
        [t('s04Security.health.alertsOther'), String(data.alertsOpen.other), true],
        [t('s04Security.health.incidents'), String(data.incidentsOpen), data.incidentsOpen === 0],
        [t('s04Security.health.siemFailing'), String(data.siemFailing), data.siemFailing === 0],
        [t('s04Security.health.events'), String(data.securityEventsLastHour), true],
      ]
    : [];
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s04Security.health.title')}
        description={t('s04Security.health.description')}
      />
      {data === null ? (
        <ErrorState description={t('s04Security.health.loadError')} />
      ) : (
        <>
          <section
            className="grid gap-sp-12 sm:grid-cols-2 lg:grid-cols-4"
            aria-label={t('s04Security.health.title')}
          >
            {cards.map(([label, value, good]) => (
              <Card key={label}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-2 text-xl font-semibold">
                  {value}
                  <Badge variant={good ? 'outline' : 'destructive'}>
                    {good ? t('s04Security.health.good') : t('s04Security.health.attention')}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </section>
          <section className="space-y-sp-12" aria-labelledby="integrations-title">
            <h2 id="integrations-title" className="text-h3 font-semibold">
              {t('s04Security.health.integrations')}
            </h2>
            <ul className="space-y-1 text-sm">
              {data.integrations.map((i) => (
                <li key={i.name} className="flex items-center gap-2">
                  <Badge variant={i.configured ? 'outline' : 'warning'}>
                    {i.configured
                      ? t('s04Security.health.configured')
                      : t('s04Security.health.missing')}
                  </Badge>
                  {i.name}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
