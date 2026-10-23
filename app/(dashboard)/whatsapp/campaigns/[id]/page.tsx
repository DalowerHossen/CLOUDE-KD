// path: app/(dashboard)/whatsapp/campaigns/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { CampaignActionButton } from '@/components/whatsapp/automation-forms';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getService } from '@/lib/container';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { campaignReport, type CampaignReport } from '@/services/whatsapp/campaigns';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'WhatsApp campaign report' };

export default async function CampaignReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('whatsapp.read', 'tenant', 'whatsapp_campaign');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const canManage = await getService('permissions').can(actor, 'whatsapp.campaigns.manage', {
    type: 'whatsapp_campaign',
  });
  let report: CampaignReport | null;
  try {
    report = await campaignReport(actor.companyId as string, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    report = null;
  }
  const reasons = (rows: { reason: string; count: number }[]): JSX.Element =>
    rows.length === 0 ? (
      <p className="text-sm text-muted-foreground">{t('s16Whatsapp.campaigns.none')}</p>
    ) : (
      <ul className="space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.reason}>
            <span className="tabular-nums font-medium">{r.count}</span> {r.reason}
          </li>
        ))}
      </ul>
    );
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={report ? report.campaign.name : t('s16Whatsapp.campaigns.reportTitle')}
        description={t('s16Whatsapp.campaigns.reportTitle')}
        actions={
          <Button asChild variant="outline">
            <Link href="/whatsapp/campaigns" prefetch={false}>
              {t('s16Whatsapp.campaigns.back')}
            </Link>
          </Button>
        }
      />
      {report === null ? (
        <ErrorState description={t('s16Whatsapp.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {t(`s16Whatsapp.campaigns.states.${report.campaign.status}` as StringKey)}
                </Badge>
                <Badge variant="outline">
                  {t(
                    `s16Whatsapp.campaigns.modes.${report.campaign.dryRun ? 'dry' : 'live'}` as StringKey,
                  )}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <dl className="grid gap-sp-8 text-sm sm:grid-cols-3 lg:grid-cols-6">
                {(['total', 'pending', 'sent', 'dryRun', 'skipped', 'failed'] as const).map((k) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">
                      {t(`s16Whatsapp.campaigns.items.${k}` as StringKey)}
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums">{report.items[k]}</dd>
                  </div>
                ))}
              </dl>
              {!report.campaign.dryRun ? (
                <dl className="grid gap-sp-8 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  {(['sent', 'delivered', 'read', 'failed'] as const).map((k) => (
                    <div key={k}>
                      <dt className="text-muted-foreground">
                        {t(`s16Whatsapp.campaigns.messages.${k}` as StringKey)}
                      </dt>
                      <dd className="text-lg font-semibold tabular-nums">{report.messages[k]}</dd>
                    </div>
                  ))}
                  <div>
                    <dt className="text-muted-foreground">
                      {t('s16Whatsapp.campaigns.deliveredShare')}
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums">{report.deliveredShare}%</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">
                      {t('s16Whatsapp.campaigns.readShare')}
                    </dt>
                    <dd className="text-lg font-semibold tabular-nums">{report.readShare}%</dd>
                  </div>
                </dl>
              ) : null}
              {canManage && report.retryable > 0 && !report.campaign.dryRun ? (
                <CampaignActionButton
                  id={id}
                  action="retry"
                  label={`${t('s16Whatsapp.campaigns.retry')} (${report.retryable})`}
                />
              ) : null}
            </CardContent>
          </Card>
          <div className="grid gap-sp-16 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('s16Whatsapp.campaigns.failuresTitle')}</CardTitle>
              </CardHeader>
              <CardContent>{reasons(report.failures)}</CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('s16Whatsapp.campaigns.skipsTitle')}</CardTitle>
              </CardHeader>
              <CardContent>{reasons(report.skips)}</CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Whatsapp.campaigns.sampleTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('s16Whatsapp.campaigns.sampleColumns.name')}</TableHead>
                    <TableHead>{t('s16Whatsapp.campaigns.sampleColumns.phone')}</TableHead>
                    <TableHead>{t('s16Whatsapp.campaigns.sampleColumns.status')}</TableHead>
                    <TableHead>{t('s16Whatsapp.campaigns.sampleColumns.reason')}</TableHead>
                    <TableHead>{t('s16Whatsapp.campaigns.sampleColumns.text')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.sample.map((r) => (
                    <TableRow key={r.phone}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="font-mono text-xs">{r.phone}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {t(`s16Whatsapp.campaigns.sampleStates.${r.status}` as StringKey)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.reason ?? '-'}</TableCell>
                      <TableCell className="max-w-md break-words text-sm">
                        {r.text || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
