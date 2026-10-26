// path: app/(admin)/admin/system/jobs/page.tsx
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { jobSummary, type JobSummary } from '@/services/platform/jobs';
import { StepUpForm } from '../../account-locks/_components/step-up-form';
import { RetryButton } from '../_components/retry-button';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Job queue' };

const p = (k: string, v?: Record<string, string | number>): string =>
  t(`s16System.system.${k}` as never, v);

export default async function JobsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('system.read', 'platform', 'platform');
  const canManage = await getService('permissions').can(actor, 'system.manage', {
    type: 'platform',
  });
  let data: JobSummary | null;
  try {
    data = await jobSummary();
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader title={p('jobsTitle')} description={p('jobsDescription')} />
      {canManage ? <StepUpForm /> : null}
      {data === null ? (
        <ErrorState description={p('loadError')} />
      ) : (
        <>
          <div className="grid gap-sp-12 sm:grid-cols-5">
            {(['pending', 'processing', 'done', 'failed', 'dead'] as const).map((s) => (
              <div key={s} className="rounded-lg border bg-card p-sp-16">
                <p className="text-sm text-muted-foreground">{p(s)}</p>
                <p className="text-h3 font-semibold">{data.counts[s]}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {data.oldestPendingMinutes === null
              ? p('noWaiting')
              : p('oldest', { minutes: data.oldestPendingMinutes })}
          </p>
          <section className="space-y-sp-8">
            <h2 className="text-h4 font-semibold">{p('problems')}</h2>
            {data.problems.length === 0 ? (
              <p className="text-sm text-muted-foreground">{p('problemsEmpty')}</p>
            ) : (
              <ul className="divide-y rounded-lg border bg-card text-sm">
                {data.problems.map((j) => (
                  <li
                    key={j.id}
                    className="flex flex-wrap items-start justify-between gap-sp-8 p-sp-12"
                  >
                    <span className="min-w-0 break-words">
                      <strong>{j.name}</strong> ({p(j.status)}) - {p('attempts')} {j.attempts}/
                      {j.maxAttempts}
                      <span className="block text-muted-foreground">{j.lastError}</span>
                    </span>
                    {canManage ? <RetryButton id={j.id} label={p('retry')} /> : null}
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
