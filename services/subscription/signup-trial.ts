// path: services/subscription/signup-trial.ts
// Starts the free trial of a new company at sign-up. It never makes a sign-up fail: a problem is logged and the company
// simply stays on the free plan.
import 'server-only';
import { SIGNUP_TRIAL_DAYS, SIGNUP_TRIAL_PLAN } from '@/config/trial';
import { getService } from '@/lib/container';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { changeCompanyPlan } from '@/services/plan/migrate';
import { getPlanBySlug } from '@/services/plan/plans';
import { getSubRow, logEvent } from './platform';

const log = createLogger({ component: 'signup-trial' });

export async function startSignupTrial(companyId: string, userId: string): Promise<boolean> {
  try {
    if (await getSubRow(companyId)) return false;
    if (!(await getPlanBySlug(SIGNUP_TRIAL_PLAN))) {
      log.warn('the trial plan does not exist; the company stays on the free plan', {
        plan: SIGNUP_TRIAL_PLAN,
      });
      return false;
    }
    const start = new Date();
    const end = new Date(start.getTime() + SIGNUP_TRIAL_DAYS * 86_400_000);
    const made = await getAdminSupabase()
      .from('platform_subscriptions')
      .insert({
        company_id: companyId,
        plan_slug: SIGNUP_TRIAL_PLAN,
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
    await changeCompanyPlan(companyId, SIGNUP_TRIAL_PLAN, userId, 'Free trial at sign-up');
    await logEvent(
      { id: String(made.data.id), company_id: companyId },
      'trial_started',
      {
        days: SIGNUP_TRIAL_DAYS,
        plan: SIGNUP_TRIAL_PLAN,
        source: 'signup',
      },
      userId,
    );
    await getService('audit').record({
      action: 'subscription.signup_trial_started',
      resourceType: 'company',
      resourceId: companyId,
      companyId,
      metadata: { plan: SIGNUP_TRIAL_PLAN, days: SIGNUP_TRIAL_DAYS },
    });
    return true;
  } catch (error) {
    log.error('the sign-up trial could not be started', { error });
    return false;
  }
}
