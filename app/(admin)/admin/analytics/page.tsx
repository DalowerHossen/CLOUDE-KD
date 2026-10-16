// path: app/(admin)/admin/analytics/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { readPixels, summary, type AnalyticsSummary } from '@/services/analytics/pixels';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { PixelsForm } from './_components/pixels-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Analytics and pixels' };

type Top = AnalyticsSummary['topPages'][number];
const columns: readonly DataColumn<Top>[] = [
  { key: 'path', header: t('s06Public.cms.colPage'), primary: true, cell: (r) => r.path },
  { key: 'hits', header: t('s06Public.analyticsAdmin.views'), cell: (r) => r.hits },
];

export default async function AdminAnalyticsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('analytics.read', 'platform', 'analytics');
  let data: AnalyticsSummary | null;
  try {
    data = await summary(30);
  } catch {
    data = null;
  }
  const pixels = await readPixels();
  const canEdit = actor.role === 'super_admin' || actor.role === 'ceo';
  const totals = data?.totals ?? {};
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s06Public.analyticsAdmin.title')}
        description={t('s06Public.analyticsAdmin.description')}
      />
      {data === null ? (
        <ErrorState description={t('s06Public.cms.loadError')} />
      ) : (
        <>
          <section
            className="grid gap-sp-12 sm:grid-cols-4"
            aria-label={t('s06Public.analyticsAdmin.last30')}
          >
            {(
              [
                ['page_view', t('s06Public.analyticsAdmin.views')],
                ['signup_click', t('s06Public.analyticsAdmin.signups')],
                ['contact_sent', t('s06Public.analyticsAdmin.contacts')],
                ['free_tool_used', t('s06Public.analyticsAdmin.tools')],
              ] as const
            ).map(([key, label]) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-h3 font-semibold">{totals[key] ?? 0}</CardContent>
              </Card>
            ))}
          </section>
          <DataTable
            columns={columns}
            rows={data.topPages}
            getRowId={(r) => r.path}
            caption={t('s06Public.analyticsAdmin.topPages')}
            empty={<p className="p-sp-16 text-sm">{t('s06Public.analyticsAdmin.noData')}</p>}
          />
        </>
      )}
      {canEdit ? (
        <section className="space-y-sp-12" aria-labelledby="pixels-title">
          <h2 id="pixels-title" className="text-h3 font-semibold">
            {t('s06Public.analyticsAdmin.pixels')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('s06Public.analyticsAdmin.pixelsHelp')}
          </p>
          <StepUpForm />
          <PixelsForm initial={pixels} />
        </section>
      ) : null}
    </div>
  );
}
