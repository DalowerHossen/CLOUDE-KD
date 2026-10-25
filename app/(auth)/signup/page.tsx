// path: app/(auth)/signup/page.tsx
import type { Metadata } from 'next';
import { getPublicEnv } from '@/lib/env/public';
import { publicPlans } from '@/services/plan/plans';
import { SignupForm, type PlanChoice } from '../_components/signup-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Create account' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const asked = (await searchParams).plan;
  let plans: PlanChoice[] = [];
  try {
    plans = (await publicPlans()).map((p) => ({
      slug: p.slug,
      name: p.name,
      priceMonthly: p.priceMonthly,
      trialDays: p.trialDays,
    }));
  } catch {
    plans = [];
  }
  const wanted = typeof asked === 'string' ? asked : '';
  return (
    <SignupForm
      siteKey={getPublicEnv().NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      plans={plans}
      defaultPlan={plans.some((p) => p.slug === wanted) ? wanted : ''}
    />
  );
}
