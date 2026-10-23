// path: services/hr/performance.ts
// Performance notes and reviews. A note is free text from a manager; a review has a period (for example 2026 Q1) and a rating from
// 1 to 5 and may suggest a raise (the link to pay is a suggestion that the owner acts on in the employee's pay details). Notes are
// read only by people with the performance permission and every read is audited.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { ReportColumn, ReportResult } from '@/lib/reports/types';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { performanceInput, performanceReport, type NoteRow } from './hr-rules';

const need = (actor: Actor): string => {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  return actor.companyId;
};

export interface NoteView {
  id: string;
  kind: 'note' | 'review';
  period: string;
  rating: number | null;
  body: string;
  raiseSuggested: boolean;
  createdAt: string;
}

export async function addNote(actor: Actor, input: unknown): Promise<NoteView> {
  const companyId = need(actor);
  const parsed = performanceInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The note is not valid.');
  const d = parsed.data;
  const { data, error } = await getAdminSupabase()
    .from('performance_notes')
    .insert({
      company_id: companyId,
      employee_id: d.employeeId,
      kind: d.kind,
      period: d.period,
      rating: d.rating,
      body: d.body,
      raise_suggested: d.raiseSuggested,
      author_id: actor.userId,
    })
    .select('id, kind, period, rating, body, raise_suggested, created_at')
    .single();
  if (error) mapAccountingError(error);
  await getService('audit').record({
    action: 'hr.performance_added',
    resourceType: 'employee',
    resourceId: d.employeeId,
    companyId,
    metadata: { kind: d.kind, period: d.period, rating: d.rating },
  });
  return view(data as Record<string, unknown>);
}

const view = (r: Record<string, unknown>): NoteView => ({
  id: String(r.id),
  kind: r.kind === 'review' ? 'review' : 'note',
  period: String(r.period),
  rating: r.rating === null ? null : toInt(r.rating),
  body: String(r.body),
  raiseSuggested: r.raise_suggested === true,
  createdAt: String(r.created_at),
});

/** The notes of one employee, newest first. The read is audited. */
export async function listNotes(actor: Actor, employeeId: string): Promise<NoteView[]> {
  const companyId = need(actor);
  const { data, error } = await getAdminSupabase()
    .from('performance_notes')
    .select('id, kind, period, rating, body, raise_suggested, created_at')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'hr.performance_viewed',
    resourceType: 'employee',
    resourceId: employeeId,
    companyId,
    metadata: { count: (data ?? []).length },
  });
  return (data ?? []).map((r) => view(r as Record<string, unknown>));
}

const col = (key: string, label: string, type: ReportColumn['type'] = 'text'): ReportColumn => ({
  key,
  label,
  type,
});

/** Per employee and period: reviews, notes, average rating and whether a raise was suggested. */
export async function performanceTable(
  actor: Actor,
  from: string,
  to: string,
): Promise<ReportResult> {
  const companyId = need(actor);
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('performance_notes')
    .select(
      'employee_id, kind, period, rating, raise_suggested, employees:employee_id(first_name, last_name)',
    )
    .eq('company_id', companyId)
    .gte('created_at', `${from}T00:00:00Z`)
    .lte('created_at', `${to}T23:59:59Z`)
    .is('deleted_at', null)
    .limit(20_000);
  if (error) throw new InternalError(error);
  const names = new Map<string, string>();
  const rows: NoteRow[] = (data ?? []).map((r) => {
    const e = (
      r as unknown as {
        employees:
          | { first_name: string; last_name: string }
          | { first_name: string; last_name: string }[]
          | null;
      }
    ).employees;
    const x = Array.isArray(e) ? e[0] : e;
    if (x) names.set(String(r.employee_id), `${x.first_name} ${x.last_name}`);
    return {
      employeeId: String(r.employee_id),
      kind: r.kind === 'review' ? 'review' : 'note',
      period: String(r.period),
      rating: r.rating === null ? null : toInt(r.rating),
      raiseSuggested: r.raise_suggested === true,
    };
  });
  await getService('audit').record({
    action: 'hr.performance_report',
    resourceType: 'employee',
    resourceId: null,
    companyId,
    metadata: { from, to },
  });
  const report = performanceReport(rows);
  return {
    key: 'performance',
    title: 'Performance',
    period: { from, to },
    columns: [
      col('employee', 'Employee'),
      col('period', 'Period'),
      col('reviews', 'Reviews', 'number'),
      col('notes', 'Notes', 'number'),
      col('average', 'Average rating', 'number'),
      col('raise', 'Raise suggested'),
    ],
    rows: report.map((r) => ({
      employee: names.get(r.employeeId) ?? '',
      period: r.period || '-',
      reviews: String(r.reviews),
      notes: String(r.notes),
      average: r.average ?? '-',
      raise: r.raiseSuggested ? 'Yes' : '',
    })),
    totals: null,
    notes: ['A raise suggestion is advice. The owner changes pay in the employee pay details.'],
  };
}
