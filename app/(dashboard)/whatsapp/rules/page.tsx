// path: app/(dashboard)/whatsapp/rules/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { RuleForm, RulePatchButton } from '@/components/whatsapp/automation-forms';
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
import { RULE_EVENTS } from '@/config/s16-whatsapp';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listRules, listRuns, type RuleView, type RunView } from '@/services/whatsapp/rules';
import { listTemplates, type TemplateView } from '@/services/whatsapp/templates';
import { WhatsAppTabs } from '../tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'WhatsApp rules' };

export default async function WhatsAppRulesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('whatsapp.read', 'tenant', 'whatsapp_rule');
  const companyId = actor.companyId as string;
  const canManage = await getService('permissions').can(actor, 'whatsapp.manage', {
    type: 'whatsapp_rule',
  });
  let data: { rules: RuleView[]; runs: RunView[]; templates: TemplateView[] } | null;
  try {
    const [rules, runs, templates] = await Promise.all([
      listRules(companyId),
      listRuns(companyId, undefined, 30),
      listTemplates(companyId),
    ]);
    data = { rules, runs, templates };
  } catch {
    data = null;
  }
  const nameOf = (id: string): string => data?.templates.find((x) => x.id === id)?.name ?? '-';
  const when = (r: RuleView): string =>
    r.triggerKind === 'due_soon'
      ? `${r.daysBefore} ${t('s16Whatsapp.rules.days')}`
      : t(`s16Whatsapp.rules.events.${r.eventName ?? ''}` as StringKey);
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Whatsapp.rules.title')}
        description={t('s16Whatsapp.rules.description')}
        actions={<WhatsAppTabs current="/whatsapp/rules" />}
      />
      {canManage && data ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Whatsapp.rules.newTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <RuleForm
              events={RULE_EVENTS}
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
      ) : data.rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s16Whatsapp.rules.empty')}</p>
      ) : (
        <Card>
          <CardContent className="pt-sp-16">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Whatsapp.rules.columns.name')}</TableHead>
                  <TableHead>{t('s16Whatsapp.rules.columns.when')}</TableHead>
                  <TableHead>{t('s16Whatsapp.rules.columns.template')}</TableHead>
                  <TableHead>{t('s16Whatsapp.rules.columns.state')}</TableHead>
                  <TableHead>{t('s16Whatsapp.rules.columns.delay')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rules.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{when(r)}</TableCell>
                    <TableCell className="font-mono text-xs">{nameOf(r.templateId)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(
                          `s16Whatsapp.rules.states.${r.enabled ? (r.dryRun ? 'dry' : 'live') : 'off'}` as StringKey,
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{r.delayMinutes}</TableCell>
                    <TableCell>
                      {canManage ? (
                        <div className="flex flex-wrap items-start gap-2">
                          <RulePatchButton
                            id={r.id}
                            version={r.version}
                            patch={{ enabled: !r.enabled }}
                            label={t(
                              r.enabled ? 's16Whatsapp.rules.turnOff' : 's16Whatsapp.rules.turnOn',
                            )}
                          />
                          <RulePatchButton
                            id={r.id}
                            version={r.version}
                            patch={{ dryRun: !r.dryRun }}
                            label={t(
                              r.dryRun ? 's16Whatsapp.rules.goLive' : 's16Whatsapp.rules.goDry',
                            )}
                          />
                          <ActionButton
                            endpoint={`/api/whatsapp/rules/${r.id}`}
                            method="DELETE"
                            variant="destructive"
                            label={t('s16Whatsapp.rules.remove')}
                            doneText={t('s16Whatsapp.rules.removed')}
                          />
                        </div>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Whatsapp.rules.runsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {!data || data.runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('s16Whatsapp.rules.runsEmpty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Whatsapp.rules.runColumns.when')}</TableHead>
                  <TableHead>{t('s16Whatsapp.rules.runColumns.status')}</TableHead>
                  <TableHead>{t('s16Whatsapp.rules.runColumns.text')}</TableHead>
                  <TableHead>{t('s16Whatsapp.rules.runColumns.reason')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.createdAt.slice(0, 16).replace('T', ' ')}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`s16Whatsapp.rules.runStates.${r.status}` as StringKey)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md break-words text-sm">
                      {r.renderedText || '-'}
                    </TableCell>
                    <TableCell className="text-sm">{r.reason ?? '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
