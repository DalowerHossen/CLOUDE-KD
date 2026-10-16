// path: app/(admin)/admin/feedback/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { feedbackSummary, type FeedbackSummary } from '@/services/support/opinion';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Feedback and satisfaction' };

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border bg-card p-sp-16">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-h3 font-semibold">{value}</p>
    </div>
  );
}

export default async function FeedbackAdminPage(): Promise<JSX.Element> {
  await requirePagePermission('feedback.read', 'platform', 'feedback');
  let data: FeedbackSummary | null;
  try {
    data = await feedbackSummary();
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s07Company.feedback.adminTitle')}
        description={t('s07Company.feedback.adminDescription')}
      />
      {data === null ? (
        <ErrorState description={t('s07Company.feedback.loadError')} />
      ) : (
        <>
          <div className="grid gap-sp-12 sm:grid-cols-2 lg:grid-cols-5">
            <Stat
              label={t('s07Company.feedback.npsScore')}
              value={data.nps.score === null ? '-' : String(data.nps.score)}
            />
            <Stat label={t('s07Company.feedback.responses')} value={String(data.nps.responses)} />
            <Stat label={t('s07Company.feedback.promoters')} value={String(data.nps.promoters)} />
            <Stat label={t('s07Company.feedback.passives')} value={String(data.nps.passives)} />
            <Stat label={t('s07Company.feedback.detractors')} value={String(data.nps.detractors)} />
          </div>
          <section className="space-y-sp-8">
            <h2 className="text-h4 font-semibold">{t('s07Company.feedback.recent')}</h2>
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('s07Company.feedback.noComments')}</p>
            ) : (
              <ul className="space-y-sp-8 text-sm">
                {data.recent.map((r, i) => (
                  <li key={`${r.at}-${i}`} className="rounded-lg border bg-card p-sp-12">
                    <p className="text-muted-foreground">
                      {r.companyName} - {r.kind === 'nps' ? `NPS ${r.score}` : r.category} -{' '}
                      {r.at.replace('T', ' ').slice(0, 16)} UTC
                    </p>
                    <p className="whitespace-pre-wrap break-words">{r.comment}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
