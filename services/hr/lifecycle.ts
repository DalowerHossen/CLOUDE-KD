// path: services/hr/lifecycle.ts
// Termination and resignation. The employee is marked terminated with a last day, an offboarding checklist is made (return of
// equipment, access, handover, final pay and the exit talk) and the leave still left is shown for the final settlement. The final
// pay itself is made by the next pay run, which pays a terminated employee for the days up to the last day; the owner pays unused
// leave there as a bonus when the company owes it.
import 'server-only';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { dayText } from '@/services/accounting/journal-rules';
import { createChecklist, type ChecklistView } from './checklists';
import { listBalances, type BalanceView } from './leave';

export const terminateInput = z
  .object({
    version: z.number().int().min(1),
    endDate: dayText,
    reason: z.enum(['resignation', 'termination', 'end_of_contract', 'other']),
    note: z
      .string()
      .trim()
      .max(300)
      .refine((v) => !/[<>]/.test(v), { message: 'Angle brackets are not allowed.' })
      .default(''),
  })
  .strict();

export interface Termination {
  checklist: ChecklistView;
  leaveLeft: BalanceView[];
}

export async function terminateEmployee(
  actor: Actor,
  employeeId: string,
  input: unknown,
): Promise<Termination> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = terminateInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The termination is not valid.');
  const d = parsed.data;
  const admin = getAdminSupabase();
  const found = await admin
    .from('employees')
    .select('join_date, status')
    .eq('company_id', companyId)
    .eq('id', employeeId)
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) mapAccountingError(found.error);
  if (!found.data) throw new NotFoundError();
  if (found.data.status === 'terminated')
    throw new ConflictError('This employee is already terminated.');
  if (d.endDate < String(found.data.join_date))
    throw new ValidationError('The last day cannot be before the join date.');
  const { data, error } = await admin
    .from('employees')
    .update({ status: 'terminated', end_date: d.endDate })
    .eq('company_id', companyId)
    .eq('id', employeeId)
    .eq('version', d.version)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0)
    throw new ConflictError('The employee changed. Reload and try again.');
  await getService('audit').record({
    action: 'hr.employee_terminated',
    resourceType: 'employee',
    resourceId: employeeId,
    companyId,
    metadata: { endDate: d.endDate, reason: d.reason },
  });
  const checklist = await createChecklist(actor, { employeeId, kind: 'offboarding' });
  const year = Number(d.endDate.slice(0, 4));
  const leaveLeft = (await listBalances(companyId, { employeeId, year })).filter(
    (b) => Number(b.left) > 0,
  );
  return { checklist, leaveLeft };
}
