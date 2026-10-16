// path: services/company/platform-setup.ts
// The first-login checklist of the super admin: choose the approval mode, confirm the e-mail sender and the
// security defaults. Each step is recorded once; the choice of approval mode is applied through the approval engine's
// own solo-mode switch.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError } from '@/lib/errors';
import { SETUP_STEPS, type SetupInput } from '@/lib/company/ops-input';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { isSoloMode, setSoloMode } from '@/services/approval/solo-mode';
import type { Actor } from '@/types/contracts';

export interface SetupView {
  steps: { key: (typeof SETUP_STEPS)[number]; done: boolean; choice: string; at: string | null }[];
  complete: boolean;
  soloMode: boolean;
}

export async function setupView(): Promise<SetupView> {
  const { data, error } = await getAdminSupabase()
    .from('platform_setup')
    .select('step_key, choice, completed_at')
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  const rows = new Map((data ?? []).map((r) => [String(r.step_key), r]));
  const steps = SETUP_STEPS.map((key) => {
    const row = rows.get(key);
    return {
      key,
      done: Boolean(row),
      choice: row ? String(row.choice) : '',
      at: row ? String(row.completed_at) : null,
    };
  });
  return { steps, complete: steps.every((s) => s.done), soloMode: await isSoloMode() };
}

export async function completeStep(actor: Actor, input: SetupInput): Promise<void> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  if (input.step === 'approval_mode') await setSoloMode(actor, input.choice === 'solo');
  const admin = getAdminSupabase();
  const existing = await admin
    .from('platform_setup')
    .select('id, version')
    .eq('step_key', input.step)
    .is('deleted_at', null)
    .maybeSingle();
  if (existing.error) throw new InternalError(existing.error);
  const write = existing.data
    ? await admin
        .from('platform_setup')
        .update({
          choice: input.choice,
          completed_by: actor.userId,
          completed_at: new Date().toISOString(),
        })
        .eq('id', String(existing.data.id))
        .eq('version', Number(existing.data.version))
    : await admin
        .from('platform_setup')
        .insert({ step_key: input.step, choice: input.choice, completed_by: actor.userId });
  if (write.error) throw new InternalError(write.error);
  await getService('audit').record({
    action: 'platform.setup_step',
    resourceType: 'platform_setup',
    resourceId: null,
    companyId: null,
    metadata: { step: input.step, choice: input.choice, by: actor.userId },
  });
}
