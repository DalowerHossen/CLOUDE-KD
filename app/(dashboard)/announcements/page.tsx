// path: app/(dashboard)/announcements/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listLive, type AnnouncementView } from '@/services/company/announcements';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Notices' };

export default async function NoticesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('announcement.read', 'tenant', 'announcement');
  let items: AnnouncementView[] | null;
  try {
    items = await listLive(actor.role);
  } catch {
    items = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s07Company.adminOps.liveTitle')}
        description={t('s07Company.adminOps.liveDescription')}
      />
      {items === null ? (
        <ErrorState description={t('s07Company.adminOps.loadError')} />
      ) : items.length === 0 ? (
        <EmptyState title={t('s07Company.adminOps.liveEmpty')} />
      ) : (
        <ul className="space-y-sp-8">
          {items.map((a) => (
            <li key={a.id} className="space-y-1 rounded-lg border bg-card p-sp-16 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-sp-8">
                <p className="font-medium">{a.title}</p>
                <Badge variant="outline">{a.kind}</Badge>
              </div>
              <p className="whitespace-pre-wrap break-words">{a.body}</p>
              <p className="text-muted-foreground">
                {a.startsAt.slice(0, 16).replace('T', ' ')} -{' '}
                {a.endsAt.slice(0, 16).replace('T', ' ')} UTC
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
