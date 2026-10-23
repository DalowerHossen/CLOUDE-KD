// path: app/(dashboard)/social/calendar/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PostActionButton } from '@/components/social/social-forms';
import { RescheduleForm } from '@/components/social/automation-forms';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { addDays } from '@/lib/social/schedule';
import { requirePagePermission } from '@/services/base/page-guard';
import { listPosts, type PostView } from '@/services/social/posts';
import { SocialTabs } from '../tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Social media calendar' };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The first day (YYYY-MM-01) of the month before or after a month text. */
function shiftMonth(month: string, by: number): string {
  const year = Number.parseInt(month.slice(0, 4), 10);
  const index = Number.parseInt(month.slice(5, 7), 10) - 1 + by;
  const date = new Date(Date.UTC(year, index, 1));
  return date.toISOString().slice(0, 7);
}

const whenOf = (p: PostView): string => p.publishedAt ?? p.scheduledAt ?? p.createdAt;

export default async function SocialCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('social.read', 'tenant', 'social_post');
  const companyId = actor.companyId as string;
  const canPost = await getService('permissions').can(actor, 'social.post', {
    type: 'social_post',
  });
  const query = await searchParams;
  const month =
    query.month && MONTH.test(query.month) ? query.month : new Date().toISOString().slice(0, 7);
  const first = `${month}-01`;
  const next = shiftMonth(month, 1);
  let posts: PostView[] | null;
  try {
    posts = (
      await listPosts(companyId, {
        from: `${first}T00:00:00Z`,
        to: `${next}-01T00:00:00Z`,
        limit: 200,
      })
    ).filter(
      (p) =>
        p.status !== 'cancelled' &&
        whenOf(p) >= `${first}T00:00:00Z` &&
        whenOf(p) < `${next}-01T00:00:00Z`,
    );
  } catch {
    posts = null;
  }
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay();
  const length = Math.round(
    (Date.parse(`${next}-01T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86_400_000,
  );
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: length }, (_, i) => addDays(first, i)),
  ];
  const byDay = new Map<string, PostView[]>();
  for (const p of posts ?? [])
    byDay.set(whenOf(p).slice(0, 10), [...(byDay.get(whenOf(p).slice(0, 10)) ?? []), p]);
  const movable = (posts ?? []).filter((p) => p.status === 'scheduled' || p.status === 'draft');

  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Social.calendar.title')}
        description={t('s16Social.calendar.description')}
        actions={<SocialTabs current="/social/calendar" />}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/social/calendar?month=${shiftMonth(month, -1)}`} prefetch={false}>
            {t('s16Social.calendar.previous')}
          </Link>
        </Button>
        <span className="font-medium">{month}</span>
        <Button asChild variant="outline" size="sm">
          <Link href={`/social/calendar?month=${next}`} prefetch={false}>
            {t('s16Social.calendar.next')}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/social/calendar" prefetch={false}>
            {t('s16Social.calendar.thisMonth')}
          </Link>
        </Button>
      </div>
      {posts === null ? (
        <ErrorState description={t('s16Social.common.loadError')} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[42rem] grid-cols-7 gap-px rounded-md border bg-border text-xs"
              role="grid"
            >
              {([0, 1, 2, 3, 4, 5, 6] as const).map((d) => (
                <div key={d} className="bg-muted p-1 text-center font-medium" role="columnheader">
                  {t(`s16Social.calendar.weekdays.d${d}` as StringKey)}
                </div>
              ))}
              {cells.map((day, i) => (
                <div
                  key={day ?? `blank-${i}`}
                  className="min-h-24 bg-background p-1"
                  role="gridcell"
                >
                  {day ? (
                    <>
                      <div className="text-muted-foreground">{day.slice(8)}</div>
                      <ul className="space-y-0.5">
                        {(byDay.get(day) ?? []).slice(0, 3).map((p) => (
                          <li key={p.id} className="truncate rounded bg-muted px-1" title={p.body}>
                            {whenOf(p).slice(11, 16)} {p.body || '-'}
                            {p.approvalStatus === 'pending' || p.approvalStatus === 'rejected'
                              ? ' *'
                              : ''}
                          </li>
                        ))}
                        {(byDay.get(day) ?? []).length > 3 ? (
                          <li className="text-muted-foreground">
                            +{(byDay.get(day) ?? []).length - 3} {t('s16Social.calendar.more')}
                          </li>
                        ) : null}
                      </ul>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t('s16Social.calendar.legend')}</p>
          {movable.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('s16Social.calendar.empty')}</p>
          ) : (
            <Card>
              <CardContent className="space-y-sp-12 pt-sp-16">
                {movable.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-start justify-between gap-2 border-b pb-sp-12 last:border-b-0"
                  >
                    <div className="min-w-0 max-w-md space-y-1">
                      <p className="break-words text-sm">{p.body || '-'}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.accountName} - {whenOf(p).slice(0, 16).replace('T', ' ')} UTC{' '}
                        <Badge variant="outline">
                          {t(`s16Social.posts.states.${p.status}` as StringKey)}
                        </Badge>{' '}
                        <Badge variant="outline">
                          {t(`s16Social.posts.approval.${p.approvalStatus}` as StringKey)}
                        </Badge>
                      </p>
                    </div>
                    {canPost ? (
                      <div className="space-y-1">
                        <RescheduleForm id={p.id} version={p.version} />
                        <PostActionButton
                          id={p.id}
                          action="cancel"
                          variant="destructive"
                          label={t('s16Social.posts.cancel')}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
