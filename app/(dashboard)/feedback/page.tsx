// path: app/(dashboard)/feedback/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { FeedbackPanel } from '@/components/feedback/feedback-panel';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { promptDue } from '@/services/support/opinion';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Feedback' };

export default async function FeedbackPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('feedback.send', 'tenant', 'feedback');
  const due = await promptDue(actor).catch(() => false);
  return (
    <div className="max-w-2xl space-y-sp-16">
      <PageHeader
        title={t('s07Company.feedback.title')}
        description={t('s07Company.feedback.description')}
      />
      <FeedbackPanel npsDue={due} />
    </div>
  );
}
