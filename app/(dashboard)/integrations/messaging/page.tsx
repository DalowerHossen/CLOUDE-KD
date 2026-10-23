// path: app/(dashboard)/integrations/messaging/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { CampaignButton, CampaignForm } from '@/components/messaging/campaign-forms';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
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
import {
  campaignReport,
  listCampaigns,
  previewAudience,
  type CampaignReport,
  type CampaignView,
} from '@/services/messaging/campaigns';
import { getSettings, type MessagingSettings } from '@/services/messaging/db';
import { listRoutes, type RouteView } from '@/services/messaging/preferences';
import { channelStats, costReport } from '@/services/messaging/reports';
import { listTemplates } from '@/services/whatsapp/templates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Messaging' };

interface Data {
  settings: MessagingSettings;
  routes: RouteView[];
  campaigns: (CampaignView & { reach: number | null; report: CampaignReport | null })[];
  templates: { id: string; name: string }[];
  channels: Awaited<ReturnType<typeof channelStats>>;
  costs: Awaited<ReturnType<typeof costReport>>;
}

export default async function MessagingPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission(
    'integrations.messaging.read',
    'tenant',
    'messaging_message',
  );
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'integrations.messaging.manage', {
    type: 'messaging_message',
  });
  let data: Data | null;
  try {
    const [settings, routes, campaigns, templates, channels, costs] = await Promise.all([
      getSettings(companyId),
      listRoutes(companyId),
      listCampaigns(companyId),
      listTemplates(companyId).catch(() => []),
      channelStats(companyId),
      costReport(companyId),
    ]);
    const detailed = await Promise.all(
      campaigns.slice(0, 10).map(async (c) => ({
        ...c,
        reach: c.status === 'draft' ? (await previewAudience(companyId, c.audience)).total : null,
        report: c.status === 'draft' ? null : await campaignReport(companyId, c.id),
      })),
    );
    data = {
      settings,
      routes,
      campaigns: detailed,
      templates: templates
        .filter((x) => x.status === 'APPROVED')
        .map((x) => ({ id: x.id, name: `${x.name} (${x.language})` })),
      channels,
      costs,
    };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader title={t('s16Messaging.title')} description={t('s16Messaging.description')} />
      {data === null ? (
        <ErrorState description={t('s16Messaging.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Messaging.reports.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.channels.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('s16Messaging.reports.empty')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('s16Messaging.reports.channel')}</TableHead>
                      <TableHead>{t('s16Messaging.reports.sent')}</TableHead>
                      <TableHead>{t('s16Messaging.reports.delivered')}</TableHead>
                      <TableHead>{t('s16Messaging.reports.deliveredRate')}</TableHead>
                      <TableHead>{t('s16Messaging.reports.engaged')}</TableHead>
                      <TableHead>{t('s16Messaging.reports.engagedRate')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.channels.map((c) => (
                      <TableRow key={c.channel}>
                        <TableCell>
                          {t(
                            `s16Messaging.channels.${c.channel === 'whatsapp' ? 'whatsapp' : 'email'}`,
                          )}
                        </TableCell>
                        <TableCell>{c.sent}</TableCell>
                        <TableCell>{c.delivered}</TableCell>
                        <TableCell>{c.deliveredRate ?? '-'}</TableCell>
                        <TableCell>{c.engaged}</TableCell>
                        <TableCell>{c.engagedRate ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {data.costs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('s16Messaging.reports.month')}</TableHead>
                      <TableHead>{t('s16Messaging.channels.email')}</TableHead>
                      <TableHead>{t('s16Messaging.channels.whatsapp')}</TableHead>
                      <TableHead>{t('s16Messaging.reports.total')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.costs.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell>{m.month}</TableCell>
                        <TableCell>{m.email}</TableCell>
                        <TableCell>{m.whatsapp}</TableCell>
                        <TableCell>{m.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('s16Messaging.settings.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              {canManage ? (
                <JsonForm
                  endpoint="/api/integrations/messaging/settings"
                  method="PUT"
                  submitLabel={t('s16Messaging.settings.save')}
                  doneText={t('s16Messaging.common.done')}
                  fields={[
                    {
                      name: 'quietEnabled',
                      label: t('s16Messaging.settings.quiet'),
                      kind: 'checkbox',
                      initial: String(data.settings.quiet.enabled),
                    },
                    {
                      name: 'quietStart',
                      label: t('s16Messaging.settings.start'),
                      required: true,
                      initial: data.settings.quiet.start,
                    },
                    {
                      name: 'quietEnd',
                      label: t('s16Messaging.settings.end'),
                      required: true,
                      initial: data.settings.quiet.end,
                    },
                    {
                      name: 'timezone',
                      label: t('s16Messaging.settings.timezone'),
                      required: true,
                      initial: data.settings.quiet.timezone,
                    },
                    {
                      name: 'emailCost',
                      label: t('s16Messaging.settings.emailCost'),
                      required: true,
                      initial: data.settings.emailCost,
                    },
                    {
                      name: 'whatsappCost',
                      label: t('s16Messaging.settings.whatsappCost'),
                      required: true,
                      initial: data.settings.whatsappCost,
                    },
                    {
                      name: 'abMinSample',
                      label: t('s16Messaging.settings.minSample'),
                      whole: true,
                      required: true,
                      initial: String(data.settings.abMinSample),
                    },
                  ]}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('s16Messaging.routes.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <p className="text-sm text-muted-foreground">{t('s16Messaging.routes.help')}</p>
              {data.routes.length === 0 ? (
                <p className="text-sm">{t('s16Messaging.routes.empty')}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.routes.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2">
                      <code>{r.kind}</code>
                      <span>
                        {r.channels.map((c) => t(`s16Messaging.channels.${c}`)).join(' > ')}
                      </span>
                      {canManage ? (
                        <ActionButton
                          endpoint={`/api/integrations/messaging/routes/${r.id}`}
                          method="DELETE"
                          variant="destructive"
                          label={t('s16Messaging.routes.remove')}
                          doneText={t('s16Messaging.common.done')}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canManage ? (
                <JsonForm
                  endpoint="/api/integrations/messaging/routes"
                  method="PUT"
                  resetAfter
                  submitLabel={t('s16Messaging.routes.save')}
                  doneText={t('s16Messaging.common.done')}
                  fields={[
                    { name: 'kind', label: t('s16Messaging.routes.kind'), required: true },
                    {
                      name: 'channels',
                      label: t('s16Messaging.routes.channels'),
                      list: true,
                      required: true,
                      initial: 'email;whatsapp',
                    },
                  ]}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('s16Messaging.campaigns.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {data.campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('s16Messaging.campaigns.empty')}</p>
              ) : (
                data.campaigns.map((c) => (
                  <div key={c.id} className="space-y-1 border-b pb-sp-12 last:border-b-0">
                    <p className="text-sm font-medium">
                      {c.name}{' '}
                      <Badge variant="outline">
                        {t(`s16Messaging.campaigns.states.${c.status}` as StringKey)}
                      </Badge>
                    </p>
                    {c.winnerReason ? (
                      <p className="text-xs text-muted-foreground">
                        {t('s16Messaging.campaigns.winner')}: {c.winnerReason}
                      </p>
                    ) : null}
                    {c.reach !== null ? (
                      <p className="text-sm">
                        {t('s16Messaging.campaigns.reaches', { count: c.reach })}
                      </p>
                    ) : null}
                    {c.report ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('s16Messaging.campaigns.variant')}</TableHead>
                            <TableHead>{t('s16Messaging.campaigns.report.messages')}</TableHead>
                            <TableHead>{t('s16Messaging.campaigns.report.sent')}</TableHead>
                            <TableHead>{t('s16Messaging.campaigns.report.delivered')}</TableHead>
                            <TableHead>{t('s16Messaging.campaigns.report.engaged')}</TableHead>
                            <TableHead>{t('s16Messaging.campaigns.report.rate')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {c.report.variants.map((v) => (
                            <TableRow key={v.label}>
                              <TableCell>{v.label}</TableCell>
                              <TableCell>{v.messages}</TableCell>
                              <TableCell>{v.sent}</TableCell>
                              <TableCell>{v.delivered}</TableCell>
                              <TableCell>{v.engaged}</TableCell>
                              <TableCell>{v.engagedRate ?? '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : null}
                    {c.report && Object.keys(c.report.skipReasons).length > 0 ? (
                      <div className="text-xs text-muted-foreground">
                        {t('s16Messaging.campaigns.report.skipped')}:
                        <ul className="list-disc pl-5">
                          {Object.entries(c.report.skipReasons).map(([reason, n]) => (
                            <li key={reason}>
                              {reason} ({n})
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {c.report ? (
                      <p className="text-xs text-muted-foreground">
                        {t('s16Messaging.campaigns.report.cost')}: {c.report.cost}
                      </p>
                    ) : null}
                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        {c.status === 'draft' ? (
                          <CampaignButton
                            id={c.id}
                            action="start"
                            expected={c.reach ?? 0}
                            label={t('s16Messaging.campaigns.start')}
                          />
                        ) : null}
                        {c.status !== 'finished' && c.status !== 'cancelled' ? (
                          <CampaignButton
                            id={c.id}
                            action="cancel"
                            variant="destructive"
                            label={t('s16Messaging.campaigns.cancel')}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
              {canManage ? (
                <>
                  <h3 className="pt-sp-12 text-sm font-semibold">
                    {t('s16Messaging.campaigns.newTitle')}
                  </h3>
                  <CampaignForm templates={data.templates} />
                </>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
