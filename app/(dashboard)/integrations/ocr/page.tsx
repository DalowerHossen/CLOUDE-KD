// path: app/(dashboard)/integrations/ocr/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { OcrSettingsForm } from '@/components/ocr/settings-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { lowConfidence } from '@/lib/ocr/rules';
import { requirePagePermission } from '@/services/base/page-guard';
import { listJobs, type JobView } from '@/services/ocr/jobs';
import { getSettings, type OcrSettings } from '@/services/ocr/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Receipt OCR' };

type Field = 'vendor' | 'date' | 'total' | 'tax';
const FIELDS: readonly Field[] = ['vendor', 'date', 'total', 'tax'];

export default async function OcrPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('integrations.ocr.read', 'tenant', 'ocr_settings');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'integrations.ocr.manage', {
    type: 'ocr_settings',
  });
  let data: { settings: OcrSettings; jobs: JobView[] } | null;
  try {
    const [settings, jobs] = await Promise.all([getSettings(companyId), listJobs(companyId, 50)]);
    data = { settings, jobs };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader title={t('s16Ocr.title')} description={t('s16Ocr.description')} />
      {data === null ? (
        <ErrorState description={t('s16Ocr.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Ocr.settings.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <p className="text-sm text-muted-foreground">{t('s16Ocr.settings.privacy')}</p>
              <p className="text-sm">
                {data.settings.hasKey
                  ? t('s16Ocr.settings.keySaved', { last4: data.settings.keyLast4 ?? '' })
                  : t('s16Ocr.settings.noKey')}
                {data.settings.consentAt
                  ? ` ${t('s16Ocr.settings.consentGiven', { date: data.settings.consentAt.slice(0, 10) })}`
                  : ''}
              </p>
              <p className="text-sm text-muted-foreground">{t('s16Ocr.settings.onlyImages')}</p>
              {canManage ? (
                <OcrSettingsForm
                  enabled={data.settings.enabled}
                  hasConsent={data.settings.consentAt !== null}
                  dateOrder={data.settings.dateOrder}
                  languageHints={data.settings.languageHints}
                  dailyLimit={data.settings.dailyLimit}
                />
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Ocr.jobs.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('s16Ocr.jobs.empty')}</p>
              ) : (
                data.jobs.map((j) => (
                  <div key={j.id} className="space-y-1 border-b pb-sp-12 last:border-b-0">
                    <p className="text-sm font-medium">
                      {j.receiptName}{' '}
                      <Badge variant="outline">
                        {t(`s16Ocr.jobs.states.${j.status}` as StringKey)}
                      </Badge>
                      {j.corrected ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({t('s16Ocr.jobs.corrected')})
                        </span>
                      ) : null}
                    </p>
                    {j.error ? <p className="text-xs text-muted-foreground">{j.error}</p> : null}
                    {j.status === 'done' ? (
                      <dl className="grid gap-x-sp-12 text-sm sm:grid-cols-4">
                        {FIELDS.map((f) => (
                          <div key={f}>
                            <dt className="text-xs text-muted-foreground">
                              {t(`s16Ocr.jobs.columns.${f}` as StringKey)}
                            </dt>
                            <dd>
                              {j.fields[f] ?? '-'}
                              {lowConfidence(j.confidence[f]) ? (
                                <span className="ml-1 text-xs text-destructive">
                                  ({t('s16Ocr.jobs.check')})
                                </span>
                              ) : null}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                    {canManage && (j.status === 'done' || j.status === 'failed') ? (
                      <div className="flex flex-wrap items-start gap-2">
                        <ActionButton
                          endpoint={`/api/integrations/ocr/jobs/${j.id}/retry`}
                          label={t('s16Ocr.jobs.retry')}
                          doneText={t('s16Ocr.common.done')}
                        />
                      </div>
                    ) : null}
                    {canManage && j.status === 'done' ? (
                      <details>
                        <summary className="cursor-pointer text-sm">
                          {t('s16Ocr.jobs.correctTitle')}
                        </summary>
                        <p className="py-1 text-xs text-muted-foreground">
                          {t('s16Ocr.jobs.correctHelp')}
                        </p>
                        <JsonForm
                          endpoint={`/api/integrations/ocr/jobs/${j.id}/correct`}
                          method="PATCH"
                          submitLabel={t('s16Ocr.jobs.save')}
                          doneText={t('s16Ocr.jobs.corrections')}
                          fields={FIELDS.map((f) => ({
                            name: f,
                            label: t(`s16Ocr.jobs.columns.${f}` as StringKey),
                            initial: j.fields[f] ?? '',
                          }))}
                        />
                      </details>
                    ) : null}
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
