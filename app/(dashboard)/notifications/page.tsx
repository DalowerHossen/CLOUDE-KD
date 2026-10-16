// path: app/(dashboard)/notifications/page.tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { NotificationCenter } from '@/components/notifications/notification-center';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@/config/notifications';
import { t } from '@/lib/i18n';
import { currentActor } from '@/services/auth/actor';
import { listNotifications, preferences } from '@/services/notification/notification-service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  const params = await searchParams;
  const unreadOnly = params.unread === '1';
  const raw = typeof params.category === 'string' ? params.category : '';
  const category = (NOTIFICATION_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as NotificationCategory)
    : null;
  let data: {
    list: Awaited<ReturnType<typeof listNotifications>>;
    prefs: Awaited<ReturnType<typeof preferences>>;
  } | null;
  try {
    const [list, prefs] = await Promise.all([
      listNotifications(actor.userId, { unreadOnly, category: category ?? undefined }),
      preferences(actor.userId),
    ]);
    data = { list, prefs };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s05Storage.notifications.title')}
        description={t('s05Storage.notifications.description')}
      />
      {data === null ? (
        <ErrorState description={t('s05Storage.notifications.loadError')} />
      ) : (
        <NotificationCenter
          userId={actor.userId}
          items={data.list.items}
          unread={data.list.unread}
          filter={{ unread: unreadOnly, category }}
          prefs={data.prefs.rows}
          dailyDigest={data.prefs.dailyDigest}
        />
      )}
    </div>
  );
}
