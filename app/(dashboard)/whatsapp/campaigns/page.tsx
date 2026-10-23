// path: app/(dashboard)/whatsapp/campaigns/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { CampaignActionButton, CampaignForm } from '@/components/whatsapp/automation-forms';
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
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getAccount } from '@/services/whatsapp/accounts';
import { listCampaigns, type CampaignView } from '@/services/whatsapp/campaigns';
import { listTemplates, type TemplateView } from '@/services/whatsapp/templates';
import { WhatsAppTabs } from '../tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'WhatsApp campaigns' };

const detailPath = (id: string): string => ['/whatsapp', 'campaigns', id].join('/');

export default async function WhatsAppCampaignsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('whatsapp.read', 'tenant', 'whatsapp_campaign');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'whatsapp.campaigns.manage', {
    type: 'whatsapp_campaign',
  });
  let data: { campaigns: CampaignView[]; templates: TemplateView[]; limit: number | null } | null;
  try {
    const [campaigns, templates, account] = await Promise.all([
      listCampaigns(companyId),
      listTemplates(companyId),
      getAccount(companyId),
    ]);
    data = { campaigns, templates, limit: account?.dailyLimit ?? null };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Whatsapp.campaigns.title')}
        description={t('s16Whatsapp.campaigns.description')}
        actions={<WhatsAppTabs current="/whatsapp/campaigns" />}
      />
      {data?.limit !== null && data?.limit !== undefined ? (
        <p className="text-sm text-muted-foreground">
          {t('s16Whatsapp.campaigns.limitNote')} {data.limit}
        </p>
      ) : null}
      {canManage && data ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Whatsapp.campaigns.newTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <CampaignForm
              templates={data.templates
                .filter((x) => x.status === 'APPROVED')
                .map((x) => ({
                  id: x.id,
                  label: `${x.name} (${x.language})`,
                  variables: x.variables,
                }))}
            />
          </CardContent>
        </Card>
      ) : null}
      {data === null ? (
        <ErrorState description={t('s16Whatsapp.common.loadError')} />
      ) : data.campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s16Whatsapp.campaigns.empty')}</p>
      ) : (
        <Card>
          <CardContent className="pt-sp-16">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Whatsapp.campaigns.columns.name')}</TableHead>
                  <TableHead>{t('s16Whatsapp.campaigns.columns.state')}</TableHead>
                  <TableHead>{t('s16Whatsapp.campaigns.columns.mode')}</TableHead>
                  <TableHead>{t('s16Whatsapp.campaigns.columns.created')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`s16Whatsapp.campaigns.states.${c.status}` as StringKey)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {t(`s16Whatsapp.campaigns.modes.${c.dryRun ? 'dry' : 'live'}` as StringKey)}
                    </TableCell>
                    <TableCell>{c.createdAt.slice(0, 10)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-start gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={detailPath(c.id)} prefetch={false}>
                            {t('s16Whatsapp.campaigns.report')}
                          </Link>
                        </Button>
                        {canManage && c.status === 'draft' ? (
                          <CampaignActionButton
                            id={c.id}
                            action="start"
                            label={t('s16Whatsapp.campaigns.start')}
                          />
                        ) : null}
                        {canManage && c.status === 'paused' ? (
                          <CampaignActionButton
                            id={c.id}
                            action="start"
                            label={t('s16Whatsapp.campaigns.resume')}
                          />
                        ) : null}
                        {canManage && (c.status === 'running' || c.status === 'scheduled') ? (
                          <CampaignActionButton
                            id={c.id}
                            action="pause"
                            label={t('s16Whatsapp.campaigns.pause')}
                          />
                        ) : null}
                        {canManage && c.status !== 'done' && c.status !== 'cancelled' ? (
                          <CampaignActionButton
                            id={c.id}
                            action="cancel"
                            variant="destructive"
                            label={t('s16Whatsapp.campaigns.cancel')}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
