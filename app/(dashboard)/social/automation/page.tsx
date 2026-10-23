// path: app/(dashboard)/social/automation/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
import { EvergreenForm, RuleForm, ScheduleForm } from '@/components/social/automation-forms';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getService } from '@/lib/container';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listAccounts, type SocialAccountView } from '@/services/social/accounts';
import {
  listItems,
  listPlans,
  lowQueues,
  type EvergreenItemView,
  type PlanView,
} from '@/services/social/evergreen';
import { listGroups } from '@/services/social/hashtags';
import { listRuns, listRules, type RuleView, type RunView } from '@/services/social/rules';
import { listSchedules, type ScheduleView } from '@/services/social/schedules';
import { SocialTabs } from '../tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Social media automation' };

interface Data {
  accounts: SocialAccountView[];
  groups: { id: string; label: string }[];
  schedules: ScheduleView[];
  rules: RuleView[];
  runs: RunView[];
  items: EvergreenItemView[];
  plans: PlanView[];
  low: { accountName: string; items: number; minItems: number }[];
}

const dayNames = (days: number[]): string =>
  days.map((d) => t(`s16Social.calendar.weekdays.d${d}` as StringKey)).join(' ');

export default async function SocialAutomationPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('social.read', 'tenant', 'social_schedule');
  const companyId = actor.companyId as string;
  const canPost = await getService('permissions').can(actor, 'social.post', {
    type: 'social_schedule',
  });
  let data: Data | null;
  try {
    const [accounts, groups, schedules, rules, runs, items, plans, low] = await Promise.all([
      listAccounts(companyId),
      listGroups(companyId),
      listSchedules(companyId),
      listRules(companyId),
      listRuns(companyId, 30),
      listItems(companyId),
      listPlans(companyId),
      lowQueues(companyId),
    ]);
    data = {
      accounts,
      groups: groups.map((g) => ({ id: g.id, label: g.name })),
      schedules,
      rules,
      runs,
      items,
      plans,
      low,
    };
  } catch {
    data = null;
  }
  const choices = (data?.accounts ?? [])
    .filter((a) => a.status === 'active')
    .map((a) => ({
      id: a.id,
      label: `${a.displayName} (${t(`s16Social.providers.${a.provider}` as StringKey)})`,
    }));
  const ruleName = new Map((data?.rules ?? []).map((r) => [r.id, r.name]));

  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Social.automation.title')}
        description={t('s16Social.automation.description')}
        actions={<SocialTabs current="/social/automation" />}
      />
      {data === null ? (
        <ErrorState description={t('s16Social.common.loadError')} />
      ) : (
        <>
          {data.low.map((q) => (
            <Alert key={q.accountName} variant="destructive">
              {t('s16Social.automation.evergreen.low', {
                account: q.accountName,
                items: q.items,
                min: q.minItems,
              })}
            </Alert>
          ))}

          <Card>
            <CardHeader>
              <CardTitle>{t('s16Social.automation.schedules.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <p className="text-sm text-muted-foreground">
                {t('s16Social.automation.schedules.help')}
              </p>
              {data.schedules.length === 0 ? (
                <p className="text-sm">{t('s16Social.automation.schedules.empty')}</p>
              ) : (
                <ul className="space-y-sp-12">
                  {data.schedules.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b pb-sp-12 last:border-b-0"
                    >
                      <div className="min-w-0 max-w-lg text-sm">
                        <p className="font-medium">
                          {s.name} <span className="text-muted-foreground">({s.accountName})</span>{' '}
                          {s.enabled ? null : (
                            <Badge variant="outline">
                              {t('s16Social.automation.schedules.off')}
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dayNames(s.daysOfWeek)} - {s.timeOfDay} {s.timezone}
                        </p>
                        <p className="break-words text-xs">{s.body.slice(0, 160)}</p>
                      </div>
                      {canPost ? (
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            endpoint={`/api/social/schedules/${s.id}`}
                            method="PATCH"
                            body={{ version: s.version, enabled: !s.enabled }}
                            label={t(
                              s.enabled
                                ? 's16Social.automation.schedules.pause'
                                : 's16Social.automation.schedules.resume',
                            )}
                            doneText={t('s16Social.automation.schedules.done')}
                          />
                          <ActionButton
                            endpoint={`/api/social/schedules/${s.id}`}
                            method="DELETE"
                            variant="destructive"
                            label={t('s16Social.automation.schedules.remove')}
                            doneText={t('s16Social.common.done')}
                          />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canPost ? <ScheduleForm accounts={choices} groups={data.groups} /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('s16Social.automation.rules.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <p className="text-sm text-muted-foreground">
                {t('s16Social.automation.rules.help')}
              </p>
              {data.rules.length === 0 ? (
                <p className="text-sm">{t('s16Social.automation.rules.empty')}</p>
              ) : (
                <ul className="space-y-sp-12">
                  {data.rules.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b pb-sp-12 last:border-b-0"
                    >
                      <div className="min-w-0 max-w-lg text-sm">
                        <p className="font-medium">
                          {r.name} <span className="text-muted-foreground">({r.triggerKey})</span>{' '}
                          <Badge variant="outline">
                            {t(
                              r.enabled
                                ? 's16Social.automation.rules.state.on'
                                : 's16Social.automation.rules.state.off',
                            )}
                          </Badge>{' '}
                          {r.dryRun ? (
                            <Badge variant="outline">
                              {t('s16Social.automation.rules.dryRunOn')}
                            </Badge>
                          ) : null}
                        </p>
                        <p className="break-words text-xs">{r.bodyTemplate.slice(0, 160)}</p>
                      </div>
                      {canPost ? (
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            endpoint={`/api/social/rules/${r.id}`}
                            method="PATCH"
                            body={{ version: r.version, enabled: !r.enabled }}
                            label={t(
                              r.enabled
                                ? 's16Social.automation.rules.disable'
                                : 's16Social.automation.rules.enable',
                            )}
                            doneText={t('s16Social.automation.rules.done')}
                          />
                          <ActionButton
                            endpoint={`/api/social/rules/${r.id}`}
                            method="PATCH"
                            body={{ version: r.version, dryRun: !r.dryRun }}
                            label={t(
                              r.dryRun
                                ? 's16Social.automation.rules.dryRunOff'
                                : 's16Social.automation.rules.dryRunBack',
                            )}
                            doneText={t('s16Social.automation.rules.done')}
                          />
                          <ActionButton
                            endpoint={`/api/social/rules/${r.id}`}
                            method="DELETE"
                            variant="destructive"
                            label={t('s16Social.automation.rules.remove')}
                            doneText={t('s16Social.common.done')}
                          />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canPost ? <RuleForm accounts={choices} groups={data.groups} /> : null}
              <h3 className="pt-sp-12 text-sm font-semibold">
                {t('s16Social.automation.rules.logTitle')}
              </h3>
              {data.runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('s16Social.automation.rules.logEmpty')}
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.runs.map((r) => (
                    <li key={r.id} className="break-words">
                      <span className="text-xs text-muted-foreground">
                        {r.createdAt.slice(0, 16).replace('T', ' ')}
                      </span>{' '}
                      <Badge variant="outline">
                        {t(`s16Social.automation.rules.statuses.${r.status}` as StringKey)}
                      </Badge>{' '}
                      {ruleName.get(r.ruleId) ?? ''} - {r.sourceKey}
                      {r.renderedText ? (
                        <span className="block text-xs text-muted-foreground">
                          {r.renderedText.slice(0, 200)}
                        </span>
                      ) : null}
                      {r.reason ? (
                        <span className="block text-xs text-muted-foreground">{r.reason}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('s16Social.automation.evergreen.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <p className="text-sm text-muted-foreground">
                {t('s16Social.automation.evergreen.help')}
              </p>
              {data.items.length === 0 ? (
                <p className="text-sm">{t('s16Social.automation.evergreen.empty')}</p>
              ) : (
                <ul className="space-y-sp-12">
                  {data.items.map((i) => (
                    <li
                      key={i.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b pb-sp-12 last:border-b-0"
                    >
                      <div className="min-w-0 max-w-lg text-sm">
                        <p className="font-medium">
                          {i.name} <span className="text-muted-foreground">({i.accountName})</span>{' '}
                          {i.enabled ? null : (
                            <Badge variant="outline">
                              {t('s16Social.automation.schedules.off')}
                            </Badge>
                          )}
                        </p>
                        <p className="break-words text-xs">{i.variants[0]?.slice(0, 160)}</p>
                        <p className="text-xs text-muted-foreground">
                          {i.priority}/5 - {t('s16Social.automation.evergreen.posted')}{' '}
                          {i.timesPosted} {t('s16Social.automation.evergreen.times')} -{' '}
                          {i.lastPostedAt
                            ? i.lastPostedAt.slice(0, 10)
                            : t('s16Social.automation.evergreen.never')}
                        </p>
                      </div>
                      {canPost ? (
                        <div className="flex flex-wrap gap-2">
                          <ActionButton
                            endpoint={`/api/social/evergreen/items/${i.id}`}
                            method="PATCH"
                            body={{ version: i.version, enabled: !i.enabled }}
                            label={t(
                              i.enabled
                                ? 's16Social.automation.evergreen.pause'
                                : 's16Social.automation.evergreen.resume',
                            )}
                            doneText={t('s16Social.automation.evergreen.done')}
                          />
                          <ActionButton
                            endpoint={`/api/social/evergreen/items/${i.id}`}
                            method="DELETE"
                            variant="destructive"
                            label={t('s16Social.automation.evergreen.remove')}
                            doneText={t('s16Social.common.done')}
                          />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canPost ? <EvergreenForm accounts={choices} /> : null}
              <h3 className="pt-sp-12 text-sm font-semibold">
                {t('s16Social.automation.evergreen.planTitle')}
              </h3>
              {data.plans.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('s16Social.automation.evergreen.planEmpty')}
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.plans.map((p) => (
                    <li key={p.id}>
                      {p.accountName}: {p.everyDays} - {p.timeOfDay} {p.timezone}
                      {p.enabled ? '' : ` (${t('s16Social.automation.schedules.off')})`}
                    </li>
                  ))}
                </ul>
              )}
              {canPost ? (
                <JsonForm
                  endpoint="/api/social/evergreen/plans"
                  method="PUT"
                  submitLabel={t('s16Social.automation.evergreen.planSave')}
                  doneText={t('s16Social.automation.evergreen.done')}
                  fields={[
                    {
                      name: 'accountId',
                      label: t('s16Social.automation.evergreen.account'),
                      kind: 'select',
                      options: [
                        { value: '', label: t('s16Social.posts.choose') },
                        ...choices.map((c) => ({ value: c.id, label: c.label })),
                      ],
                    },
                    {
                      name: 'everyDays',
                      label: t('s16Social.automation.evergreen.everyDays'),
                      whole: true,
                      required: true,
                      initial: '3',
                    },
                    {
                      name: 'timeOfDay',
                      label: t('s16Social.automation.evergreen.timeOfDay'),
                      required: true,
                      initial: '10:00',
                    },
                    {
                      name: 'timezone',
                      label: t('s16Social.automation.evergreen.timezone'),
                      required: true,
                      initial: 'UTC',
                    },
                    {
                      name: 'minItems',
                      label: t('s16Social.automation.evergreen.minItems'),
                      whole: true,
                      initial: '5',
                    },
                    {
                      name: 'enabled',
                      label: t('s16Social.automation.evergreen.planOn'),
                      kind: 'checkbox',
                      initial: 'true',
                    },
                  ]}
                />
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
