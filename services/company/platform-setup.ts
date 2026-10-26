// path: services/company/platform-setup.ts
// The first-run wizard of the super admin: the approval mode, then eight steps (branding, e-mail, payment processors,
// plans, domains, payout partners, WhatsApp, analytics). A step is recorded once; only the optional steps may be skipped.
// Where the platform can see for itself that a step is configured, the view says so ("detected"); the operator still
// confirms. The approval mode is applied through the approval engine's own solo-mode switch.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, ValidationError } from '@/lib/errors';
import {
  OPTIONAL_WIZARD_STEPS,
  WIZARD_STEPS,
  type SetupInput,
  type WizardStep,
} from '@/lib/company/ops-input';
import { createLogger } from '@/lib/logger';
import { readPixels } from '@/services/analytics/pixels';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { isSoloMode, setSoloMode } from '@/services/approval/solo-mode';
import type { Actor } from '@/types/contracts';

const log = createLogger({ component: 'platform-setup' });

export interface WizardStepView {
  key: WizardStep;
  done: boolean;
  skipped: boolean;
  optional: boolean;
  // true: the platform found a working configuration; false: found none; null: it cannot tell.
  detected: boolean | null;
  at: string | null;
}

export interface SetupView {
  approvalDone: boolean;
  steps: WizardStepView[];
  complete: boolean;
  soloMode: boolean;
}

async function platformRows(
  table: 'email_settings' | 'processors' | 'plans',
  column: string,
  value: string | boolean,
): Promise<number> {
  const { count, error } = await getAdminSupabase()
    .from(table)
    .select('id', { count: 'exact', head: true })
    .is('company_id', null)
    .is('deleted_at', null)
    .eq(column, value);
  if (error) throw error;
  return count ?? 0;
}

async function detect(key: WizardStep): Promise<boolean | null> {
  try {
    switch (key) {
      case 'email':
        return (await platformRows('email_settings', 'enabled', true)) > 0;
      case 'gateways':
        return (await platformRows('processors', 'enabled', true)) > 0;
      case 'plans':
        return (await platformRows('plans', 'status', 'active')) >= 2;
      case 'analytics': {
        const pixels = await readPixels();
        return Object.values(pixels).some((v) => typeof v === 'string' && v.length > 0);
      }
      default:
        return null;
    }
  } catch (error) {
    log.warn('setup detection failed', { step: key, error });
    return null;
  }
}

export async function setupView(): Promise<SetupView> {
  const { data, error } = await getAdminSupabase()
    .from('platform_setup')
    .select('step_key, choice, completed_at')
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  const rows = new Map((data ?? []).map((r) => [String(r.step_key), r]));
  const steps: WizardStepView[] = await Promise.all(
    WIZARD_STEPS.map(async (key) => {
      const row = rows.get(key);
      return {
        key,
        done: Boolean(row),
        skipped: row ? String(row.choice) === 'skipped' : false,
        optional: OPTIONAL_WIZARD_STEPS.includes(key),
        detected: await detect(key),
        at: row ? String(row.completed_at) : null,
      };
    }),
  );
  return {
    approvalDone: rows.has('approval_mode'),
    steps,
    complete: steps.every((s) => s.done),
    soloMode: await isSoloMode(),
  };
}

// "Re-run wizard": the eight steps become open again; the approval mode and the audit trail stay.
async function resetWizard(actor: Actor): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('platform_setup')
    .update({ deleted_at: new Date().toISOString() })
    .in('step_key', [...WIZARD_STEPS])
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'platform.setup_reset',
    resourceType: 'platform_setup',
    resourceId: null,
    companyId: null,
    metadata: { by: actor.userId },
  });
}

export async function completeStep(actor: Actor, input: SetupInput): Promise<void> {
  if (actor.role !== 'super_admin') throw new ForbiddenError();
  if (input.step === 'reset') return resetWizard(actor);
  if (input.choice === 'skipped' && !OPTIONAL_WIZARD_STEPS.includes(input.step as WizardStep)) {
    throw new ValidationError('This step cannot be skipped.');
  }
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
