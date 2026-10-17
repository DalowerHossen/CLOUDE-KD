// path: services/report/schedules.ts
// Saved report presets (a report with its filters, one per person) and report schedules (the owner has a report e-mailed
// as a download link every week or month). The file is stored encrypted through the storage contract and the e-mail
// carries a link that works for seven days; the file itself is never attached.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import type { ReportParams, ScheduleInput } from '@/lib/reports/params';
import { toInt } from '@/lib/reports/numbers';
import { nextRun } from '@/lib/schedule/report-schedule';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { buildReportFile } from './export';
import { executeReport, findReport } from './reports';

type Row = Record<string, unknown>;

function need(actor: Actor): string {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
}

export interface PresetView {
  id: string;
  reportKey: string;
  name: string;
  params: ReportParams;
}

export async function listPresets(actor: Actor, reportKey?: string): Promise<PresetView[]> {
  const companyId = need(actor);
  let q = getAdminSupabase()
    .from('report_presets')
    .select('id, report_key, name, params')
    .eq('company_id', companyId)
    .eq('user_id', actor.userId)
    .is('deleted_at', null);
  if (reportKey) q = q.eq('report_key', reportKey);
  const { data, error } = await q.order('name', { ascending: true }).limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    reportKey: String(r.report_key),
    name: String(r.name),
    params: (r.params ?? {}) as ReportParams,
  }));
}

export async function savePreset(
  actor: Actor,
  input: { reportKey: string; name: string; params: ReportParams },
): Promise<PresetView[]> {
  const companyId = need(actor);
  findReport(input.reportKey);
  const existing = await listPresets(actor);
  if (existing.length >= 50)
    throw new ValidationError('You can keep 50 saved reports. Delete one first.');
  const r = await getAdminSupabase()
    .from('report_presets')
    .insert({
      company_id: companyId,
      user_id: actor.userId,
      report_key: input.reportKey,
      name: input.name,
      params: { ...input.params, compare: input.params.compare === true },
    });
  if (r.error) throw new InternalError(r.error);
  return listPresets(actor, input.reportKey);
}

export async function deletePreset(actor: Actor, id: string): Promise<void> {
  const companyId = need(actor);
  const r = await getAdminSupabase()
    .from('report_presets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('user_id', actor.userId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
}

export interface ScheduleView extends Omit<ScheduleInput, 'recipients'> {
  id: string;
  recipients: string[];
  nextRunOn: string;
  lastRunOn: string | null;
  lastError: string;
  version: number;
}

const COLUMNS =
  'id, report_key, name, params, format, frequency, weekday, month_day, recipients, enabled, next_run_on, last_run_on, last_error, version';

function toView(r: Row): ScheduleView {
  const params = (r.params ?? {}) as {
    range?: ScheduleInput['range'];
    groupBy?: 'project' | 'person';
  };
  return {
    id: String(r.id),
    reportKey: String(r.report_key),
    name: String(r.name),
    range: params.range ?? 'last_month',
    groupBy: params.groupBy,
    format: String(r.format) as ScheduleInput['format'],
    frequency: String(r.frequency) as ScheduleInput['frequency'],
    weekday: r.weekday === null ? null : toInt(r.weekday),
    monthDay: r.month_day === null ? null : toInt(r.month_day),
    recipients: (r.recipients as string[]) ?? [],
    enabled: r.enabled === true,
    nextRunOn: String(r.next_run_on),
    lastRunOn: r.last_run_on ? String(r.last_run_on) : null,
    lastError: String(r.last_error ?? ''),
    version: toInt(r.version, 1),
  };
}

export async function listSchedules(companyId: string): Promise<ScheduleView[]> {
  const { data, error } = await getAdminSupabase()
    .from('report_schedules')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => toView(r as unknown as Row));
}

export async function createSchedule(actor: Actor, input: ScheduleInput): Promise<ScheduleView[]> {
  const companyId = need(actor);
  findReport(input.reportKey);
  if ((await listSchedules(companyId)).length >= 20)
    throw new ValidationError('You can keep 20 schedules.');
  const today = new Date().toISOString().slice(0, 10);
  const r = await getAdminSupabase()
    .from('report_schedules')
    .insert({
      company_id: companyId,
      report_key: input.reportKey,
      name: input.name,
      params: { range: input.range, ...(input.groupBy ? { groupBy: input.groupBy } : {}) },
      format: input.format,
      frequency: input.frequency,
      weekday: input.frequency === 'weekly' ? input.weekday : null,
      month_day: input.frequency === 'monthly' ? input.monthDay : null,
      recipients: input.recipients,
      enabled: input.enabled,
      next_run_on: nextRun(input.frequency, input.weekday, input.monthDay, today),
      created_by: actor.userId,
    })
    .select('id')
    .single();
  if (r.error) throw new InternalError(r.error);
  await getService('audit').record({
    action: 'report.schedule_created',
    resourceType: 'report_schedule',
    resourceId: String(r.data.id),
    companyId,
    metadata: { reportKey: input.reportKey, recipients: input.recipients.length, by: actor.userId },
  });
  return listSchedules(companyId);
}

export async function setScheduleEnabled(
  actor: Actor,
  id: string,
  enabled: boolean,
): Promise<ScheduleView[]> {
  const companyId = need(actor);
  const current = (await listSchedules(companyId)).find((s) => s.id === id);
  if (!current) throw new NotFoundError();
  const today = new Date().toISOString().slice(0, 10);
  const r = await getAdminSupabase()
    .from('report_schedules')
    .update({
      enabled,
      failure_count: 0,
      last_error: '',
      next_run_on: enabled
        ? nextRun(current.frequency, current.weekday, current.monthDay, today)
        : current.nextRunOn,
      version: current.version + 1,
    })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', current.version)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await getService('audit').record({
    action: enabled ? 'report.schedule_enabled' : 'report.schedule_disabled',
    resourceType: 'report_schedule',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return listSchedules(companyId);
}

export async function deleteSchedule(actor: Actor, id: string): Promise<ScheduleView[]> {
  const companyId = need(actor);
  const r = await getAdminSupabase()
    .from('report_schedules')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'report.schedule_deleted',
    resourceType: 'report_schedule',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return listSchedules(companyId);
}

const PAUSE_AFTER = 3;

/** Job (hourly): runs the schedules whose day has come, files the report and e-mails the link. */
export async function runDueReportSchedules(now: Date = new Date()): Promise<number> {
  const admin = getAdminSupabase();
  const today = now.toISOString().slice(0, 10);
  const { data, error } = await admin
    .from('report_schedules')
    .select(`${COLUMNS}, company_id`)
    .eq('enabled', true)
    .is('deleted_at', null)
    .lte('next_run_on', today)
    .limit(100);
  if (error) throw new InternalError(error);
  let sent = 0;
  for (const raw of data ?? []) {
    const row = raw as unknown as Row;
    const companyId = String(row.company_id);
    const s = toView(row);
    // Move the date first, so a slow or failing run is never started twice for the same day.
    const claim = await admin
      .from('report_schedules')
      .update({
        next_run_on: nextRun(s.frequency, s.weekday, s.monthDay, today),
        version: s.version + 1,
      })
      .eq('id', s.id)
      .eq('company_id', companyId)
      .eq('version', s.version)
      .select('id');
    if (claim.error || !claim.data || claim.data.length === 0) continue;
    try {
      const run = await executeReport(companyId, s.reportKey, {
        range: s.range,
        groupBy: s.groupBy,
      });
      const file = await buildReportFile(companyId, run.result, s.format, `schedule ${s.name}`);
      const record = await getService('storage').put({
        companyId,
        category: 'export',
        name: file.fileName,
        bytes: file.bytes,
        mimeType: file.mimeType.split(';')[0] ?? file.mimeType,
      });
      const link = await getService('storage').signedUrl(record.id, 7 * 24 * 3600);
      const company = await admin
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .maybeSingle();
      for (const to of s.recipients)
        await getService('email').send({
          template: 'report.ready',
          to,
          companyId,
          data: {
            companyName: String(company.data?.name ?? ''),
            reportTitle: run.result.title,
            period: run.result.period
              ? `${run.result.period.from} to ${run.result.period.to}`
              : `as of ${today}`,
            format: s.format.toUpperCase(),
            link,
          },
          idempotencyKey: `report-${s.id}-${today}-${to}`,
        });
      await admin
        .from('report_schedules')
        .update({ last_run_on: today, last_error: '', failure_count: 0 })
        .eq('id', s.id)
        .eq('company_id', companyId);
      await getService('audit').record({
        action: 'report.scheduled_sent',
        resourceType: 'report_schedule',
        resourceId: s.id,
        companyId,
        metadata: { reportKey: s.reportKey, recipients: s.recipients.length, fileId: record.id },
      });
      sent += 1;
    } catch (e) {
      const failures = toInt(row.failure_count) + 1;
      await admin
        .from('report_schedules')
        .update({
          last_error: (e instanceof Error ? e.message : 'The report failed.').slice(0, 280),
          failure_count: failures,
          enabled: failures < PAUSE_AFTER,
        })
        .eq('id', s.id)
        .eq('company_id', companyId);
      if (failures >= PAUSE_AFTER)
        await getService('notification')
          .notify({
            companyId,
            type: 'report.schedule_paused',
            title: 'A scheduled report was switched off',
            body: `The report "${s.name}" failed three times in a row and was switched off.`,
            href: '/reports',
          })
          .catch(() => undefined);
    }
  }
  return sent;
}
