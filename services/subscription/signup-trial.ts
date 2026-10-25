// path: services/subscription/signup-trial.ts
// Starts the free trial of a new company at sign-up. It never makes a sign-up fail: a problem is logged and the company
// simply stays on the free plan.
import 'server-only';
import { SIGNUP_TRIAL_DAYS, SIGNUP_TRIAL_PLAN } from '@/config/trial';
import { getService } from '@/lib/container';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { changeCompanyPlan } from '@/services/plan/migrate';
import { getPlanBySlug, publicPlans } from '@/services/plan/plans';
import { getSubRow, logEvent } from './platform';

const log = createLogger({ component: 'signup-trial' });

/**
 * The plan the trial runs on and for how long: the plan the person picked when it is a public, active plan; otherwise the
 * default trial. Choosing the free plan means no trial.
 */
async function trialChoice(
  picked: string | undefined,
): Promise<{ plan: string; days: number } | null> {
  if (picked) {
    const chosen = (await publicPlans()).find((p) => p.slug === picked);
    if (chosen) {
      if (chosen.slug === 'free') return null;
      return {
        plan: chosen.slug,
        days: chosen.trialDays > 0 ? chosen.trialDays : SIGNUP_TRIAL_DAYS,
      };
    }
  }
  return (await getPlanBySlug(SIGNUP_TRIAL_PLAN))
    ? { plan: SIGNUP_TRIAL_PLAN, days: SIGNUP_TRIAL_DAYS }
    : null;
}

export async function startSignupTrial(
  companyId: string,
  userId: string,
  pickedPlan?: string,
): Promise<boolean> {
  try {
    if (await getSubRow(companyId)) return false;
    const choice = await trialChoice(pickedPlan);
    if (!choice) {
      log.warn('no trial plan applies; the company stays on the free plan', { picked: pickedPlan });
      return false;
    }
    const start = new Date();
    const end = new Date(start.getTime() + choice.days * 86_400_000);
    const made = await getAdminSupabase()
      .from('platform_subscriptions')
      .insert({
        company_id: companyId,
        plan_slug: choice.plan,
        interval: 'month',
        status: 'trialing',
        seats: 1,
        trial_ends_at: end.toISOString(),
        trial_used: true,
        current_period_start: start.toISOString(),
        current_period_end: end.toISOString(),
      })
      .select('id')
      .single();
    if (made.error) {
      log.warn('the trial could not be recorded', { code: made.error.code });
      return false;
    }
    await changeCompanyPlan(companyId, choice.plan, userId, 'Free trial at sign-up');
    await logEvent(
      { id: String(made.data.id), company_id: companyId },
      'trial_started',
      {
        days: choice.days,
        plan: choice.plan,
        source: 'signup',
        picked: pickedPlan ?? null,
      },
      userId,
    );
    await getService('audit').record({
      action: 'subscription.signup_trial_started',
      resourceType: 'company',
      resourceId: companyId,
      companyId,
      metadata: { plan: choice.plan, days: choice.days, picked: pickedPlan ?? null },
    });
    return true;
  } catch (error) {
    log.error('the sign-up trial could not be started', { error });
    return false;
  }
}
