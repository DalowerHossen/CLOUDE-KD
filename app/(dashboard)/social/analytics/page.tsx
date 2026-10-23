// path: app/(dashboard)/social/analytics/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { t, type StringKey } from '@/lib/i18n';
import type { Comparison } from '@/lib/social/analytics';
import { requirePagePermission } from '@/services/base/page-guard';
import { overview, type AnalyticsView } from '@/services/social/analytics';
import { SocialTabs } from '../tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Social media analytics' };

const PERIODS = [
  [7, 's16Social.analytics.last7'],
  [30, 's16Social.analytics.last30'],
  [90, 's16Social.analytics.last90'],
] as const;

function Figure({ label, value }: { label: string; value: Comparison }): JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-1 pt-sp-16">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value.current}</p>
        <p className="text-xs text-muted-foreground">
          {t('s16Social.analytics.versus', { previous: value.previous })} -{' '}
          {value.changePercent === null
            ? t('s16Social.analytics.noChange')
            : `${t('s16Social.analytics.change')} ${value.changePercent}%`}
        </p>
      </CardContent>
    </Card>
  );
}

export default async function SocialAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('social.read', 'tenant', 'social_post');
  const query = await searchParams;
  const days = PERIODS.find(([d]) => String(d) === query.days)?.[0] ?? 30;
  let data: AnalyticsView | null;
  try {
    data = await overview(actor.companyId as string, { days, timezone: 'UTC' });
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Social.analytics.title')}
        description={t('s16Social.analytics.description')}
        actions={<SocialTabs current="/social/analytics" />}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">{t('s16Social.analytics.days')}</span>
        {PERIODS.map(([d, label]) => (
          <Button key={d} asChild size="sm" variant={d === days ? 'default' : 'outline'}>
            <Link href={`/social/analytics?days=${d}`} prefetch={false}>
              {t(label)}
            </Link>
          </Button>
        ))}
      </div>
      {data === null ? (
        <ErrorState description={t('s16Social.common.loadError')} />
      ) : (
        <>
          <div className="grid gap-sp-12 sm:grid-cols-2">
            <Figure label={t('s16Social.analytics.published')} value={data.published} />
            <Figure label={t('s16Social.analytics.clicks')} value={data.clicks} />
          </div>
          <div className="grid gap-sp-12 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('s16Social.analytics.perAccount')}</CardTitle>
              </CardHeader>
              <CardContent>
                {data.perAccount.length === 0 ? (
                  <p className="text-sm text-muted-foreground">-</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {data.perAccount.map((a) => (
                      <li key={a.accountId} className="flex justify-between gap-2">
                        <span>{a.accountName}</span>
                        <span>{a.published}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  {t('s16Social.analytics.bestHours')} ({data.timezone})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.bestHours.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('s16Social.analytics.bestHoursEmpty')}
                  </p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {data.bestHours.map((h) => (
                      <li key={h.hour} className="flex justify-between gap-2">
                        <span>{String(h.hour).padStart(2, '0')}:00</span>
                        <span>{h.clicks}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Social.analytics.topPosts')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.topPosts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('s16Social.analytics.topEmpty')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('s16Social.analytics.columns.text')}</TableHead>
                      <TableHead>{t('s16Social.analytics.columns.account')}</TableHead>
                      <TableHead>{t('s16Social.analytics.columns.clicks')}</TableHead>
                      <TableHead>{t('s16Social.analytics.columns.views')}</TableHead>
                      <TableHead>{t('s16Social.analytics.columns.engagement')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topPosts.map((p) => (
                      <TableRow key={p.postId}>
                        <TableCell className="max-w-md break-words text-sm">
                          {p.body || '-'}
                        </TableCell>
                        <TableCell>{p.accountName}</TableCell>
                        <TableCell>{p.clicks}</TableCell>
                        <TableCell>{p.views ?? '-'}</TableCell>
                        <TableCell>{p.engagement === null ? '-' : `${p.engagement}%`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                {t('s16Social.analytics.threadsTitle')} ({data.threads.posts}{' '}
                {t('s16Social.analytics.postsCounted')})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-sp-12 text-sm sm:grid-cols-3">
                {(['views', 'likes', 'replies', 'reposts', 'quotes', 'shares'] as const).map(
                  (k) => (
                    <div key={k}>
                      <dt className="text-muted-foreground">
                        {t(`s16Social.analytics.${k}` as StringKey)}
                      </dt>
                      <dd className="text-lg font-semibold">{data.threads[k]}</dd>
                    </div>
                  ),
                )}
                <div>
                  <dt className="text-muted-foreground">{t('s16Social.analytics.engagement')}</dt>
                  <dd className="text-lg font-semibold">
                    {data.threads.engagement === null ? '-' : `${data.threads.engagement}%`}
                  </dd>
                </div>
              </dl>
              <p className="mt-sp-12 text-xs text-muted-foreground">
                {t('s16Social.analytics.note')}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
