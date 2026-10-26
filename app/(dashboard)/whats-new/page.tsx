// path: app/(dashboard)/whats-new/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState, ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { notesForReader, type ReaderNote } from '@/services/platform/release-notes';
import { ReleaseList } from './_components/release-list';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: "What's new" };

export default async function WhatsNewPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('release.read', 'tenant', 'release_note');
  let notes: ReaderNote[] | null;
  try {
    notes = await notesForReader(actor);
  } catch {
    notes = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s16Growth.whatsNew.title')}
        description={t('s16Growth.whatsNew.description')}
      />
      {notes === null ? (
        <ErrorState description={t('s16Growth.whatsNew.loadError')} />
      ) : notes.length === 0 ? (
        <EmptyState title={t('s16Growth.whatsNew.empty')} />
      ) : (
        <ReleaseList notes={notes} />
      )}
    </div>
  );
}
