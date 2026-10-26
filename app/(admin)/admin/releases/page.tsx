// path: app/(admin)/admin/releases/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listAllNotes, type ReleaseNote } from '@/services/platform/release-notes';
import { StepUpForm } from '../account-locks/_components/step-up-form';
import { ReleaseManager } from './_components/release-manager';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Release notes' };

export default async function ReleasesPage(): Promise<JSX.Element> {
  await requirePagePermission('release.manage', 'platform', 'release_note');
  let notes: ReleaseNote[] | null;
  try {
    notes = await listAllNotes();
  } catch {
    notes = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s16Growth.releases.title')}
        description={t('s16Growth.releases.description')}
      />
      <StepUpForm />
      {notes === null ? (
        <ErrorState description={t('s16Growth.releases.loadError')} />
      ) : (
        <ReleaseManager notes={notes} />
      )}
    </div>
  );
}
