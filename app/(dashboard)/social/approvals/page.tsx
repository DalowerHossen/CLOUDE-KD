// path: app/(dashboard)/social/approvals/page.tsx
import type { Metadata } from 'next';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { DecisionButtons } from '@/components/social/automation-forms';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listPending, type PendingPost } from '@/services/social/approvals';
import { getSettings, type SocialSettings } from '@/services/social/settings';
import { SocialTabs } from '../tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Social media approvals' };

const stamp = (v: string | null): string => (v ? v.slice(0, 16).replace('T', ' ') : '-');

export default async function SocialApprovalsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('social.read', 'tenant', 'social_post');
  const companyId = actor.companyId as string;
  const canApprove = await getService('permissions').can(actor, 'social.approve', {
    type: 'social_post',
  });
  let data: { pending: PendingPost[]; settings: SocialSettings } | null;
  try {
    const [pending, settings] = await Promise.all([listPending(companyId), getSettings(companyId)]);
    data = { pending, settings };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Social.approvals.title')}
        description={t('s16Social.approvals.description')}
        actions={<SocialTabs current="/social/approvals" />}
      />
      {data === null ? (
        <ErrorState description={t('s16Social.common.loadError')} />
      ) : (
        <>
          {canApprove ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('s16Social.approvals.settingsTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <JsonForm
                  endpoint="/api/social/settings"
                  method="PUT"
                  emptyAsNull
                  submitLabel={t('s16Social.approvals.save')}
                  doneText={t('s16Social.approvals.saved')}
                  fields={[
                    {
                      name: 'approvalRequired',
                      label: t('s16Social.approvals.required'),
                      kind: 'checkbox',
                      initial: String(data.settings.approvalRequired),
                    },
                    {
                      name: 'approvalSlaHours',
                      label: t('s16Social.approvals.slaHours'),
                      whole: true,
                      initial:
                        data.settings.approvalSlaHours === null
                          ? ''
                          : String(data.settings.approvalSlaHours),
                    },
                    {
                      name: 'trackLinks',
                      label: t('s16Social.approvals.trackLinks'),
                      kind: 'checkbox',
                      initial: String(data.settings.trackLinks),
                    },
                  ]}
                />
                <p className="mt-sp-12 text-sm text-muted-foreground">
                  {t('s16Social.approvals.needsStepUp')}
                </p>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Social.approvals.queueTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('s16Social.approvals.empty')}</p>
              ) : (
                data.pending.map((p) => (
                  <div key={p.id} className="space-y-1 border-b pb-sp-12 last:border-b-0">
                    <p className="break-words text-sm">{p.body || '-'}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.accountName} - {t('s16Social.approvals.columns.when')}{' '}
                      {stamp(p.scheduledAt)} UTC - {t('s16Social.approvals.columns.sent')}{' '}
                      {stamp(p.requestedAt)}
                      {p.autoApprovesAt
                        ? ` - ${t('s16Social.approvals.columns.auto')} ${stamp(p.autoApprovesAt)}`
                        : ''}
                    </p>
                    {canApprove ? <DecisionButtons id={p.id} /> : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
