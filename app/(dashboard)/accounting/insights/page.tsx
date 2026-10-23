// path: app/(dashboard)/accounting/insights/page.tsx
import type { Metadata } from 'next';
import { DataTable, type DataColumn } from '@/components/shared/data-table';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { businessOverview, type BusinessOverview } from '@/services/budget/insights';
import { BI_REPORT_KEYS, biTable } from '@/services/budget/report-tables';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Business insights' };

type Row = Record<string, string> & { __id: string };

export default async function InsightsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('accounting.read', 'tenant', 'insight');
  let overview: BusinessOverview | null;
  try {
    overview = await businessOverview(actor.companyId as string);
  } catch {
    overview = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s15Accounting.insights.title')}
        description={t('s15Accounting.insights.description')}
      />
      {overview === null ? (
        <ErrorState description={t('s15Accounting.insights.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {t('s15Accounting.insights.healthTitle')}
                <Badge variant={overview.health.band === 'weak' ? 'destructive' : 'outline'}>
                  {t(`s15Accounting.insights.bands.${overview.health.band}` as StringKey)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <p className="text-3xl font-semibold tabular-nums">
                {overview.health.score}{' '}
                <span className="text-base text-muted-foreground">
                  {t('s15Accounting.insights.outOf')}
                </span>
              </p>
              <ul className="grid gap-sp-8 text-sm sm:grid-cols-2 lg:grid-cols-5">
                {overview.health.parts.map((p) => (
                  <li key={p.key}>
                    <span className="text-muted-foreground">
                      {t(`s15Accounting.insights.parts.${p.key}` as StringKey)}
                    </span>{' '}
                    <span className="font-medium tabular-nums">{p.score}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.insights.insightsTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {overview.insights.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('s15Accounting.insights.none')}</p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {overview.insights.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s15Accounting.insights.tipsTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {overview.tips.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {BI_REPORT_KEYS.filter((k) => k !== 'health').map((k) => {
            const table = biTable(k, overview);
            const columns: readonly DataColumn<Row>[] = table.columns.map((c, i) => ({
              key: c.key,
              header: c.label,
              primary: i === 0,
              cell: (r: Row) => (
                <span
                  className={
                    c.type === 'money' || c.type === 'number' || c.type === 'percent'
                      ? 'block text-right tabular-nums'
                      : undefined
                  }
                >
                  {r[c.key] ?? ''}
                </span>
              ),
            }));
            const rows: Row[] = table.rows.map((r, i) => ({ ...r, __id: String(i) }));
            return (
              <Card key={k}>
                <CardHeader>
                  <CardTitle>{t(`s15Accounting.insights.names.${k}` as StringKey)}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-sp-12">
                  <div className="flex flex-wrap gap-sp-8">
                    {(['csv', 'xlsx', 'pdf'] as const).map((f) => (
                      <Button key={f} asChild variant="outline">
                        <a href={`/api/accounting/insights/${k}/export?format=${f}`}>
                          {t('s15Accounting.insights.download')}{' '}
                          {f === 'csv'
                            ? t('s15Accounting.common.csv')
                            : f === 'xlsx'
                              ? t('s15Accounting.common.excel')
                              : t('s15Accounting.common.pdf')}
                        </a>
                      </Button>
                    ))}
                  </div>
                  <DataTable
                    columns={columns}
                    rows={rows}
                    getRowId={(r) => r.__id}
                    caption={t(`s15Accounting.insights.names.${k}` as StringKey)}
                    empty={<EmptyState title={t('s15Accounting.common.empty')} />}
                  />
                  {table.notes.map((n) => (
                    <p key={n} className="text-sm text-muted-foreground">
                      {n}
                    </p>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
