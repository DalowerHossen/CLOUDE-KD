// path: services/company/sso.ts
// Single sign-on readiness. The owner prepares the provider details (settings section "sso"); this service checks the
// conditions for turning it on and, when they hold, sends the activation request to the platform as a support ticket.
// Signing people in through the provider is a later platform step; nothing here changes how people sign in today.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { listMilestones, getSection, recordMilestone } from '@/services/company/settings';
import { hasActiveFactor } from '@/services/auth/credentials';
import { createTicket } from '@/services/support/tickets';
import type { Actor } from '@/types/contracts';

export interface ReadinessCheck {
  key: 'plan' | 'provider' | 'domains' | 'verified' | 'two_factor';
  ok: boolean;
}
export interface SsoReadiness {
  checks: ReadinessCheck[];
  ready: boolean;
  requestedAt: string | null;
}

export async function ssoReadiness(actor: Actor): Promise<SsoReadiness> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const sso = (await getSection(companyId, 'sso')).value;
  const providerOk =
    sso.protocol === 'oidc'
      ? sso.issuerUrl !== '' && sso.clientId !== ''
      : sso.protocol === 'saml'
        ? sso.issuerUrl !== '' && sso.loginUrl !== '' && sso.clientId !== ''
        : false;
  const [plan, verified, twoFactor, milestones] = await Promise.all([
    getService('entitlement').has(companyId, 'sso.ready'),
    getService('kyc').isVerified(companyId),
    hasActiveFactor(actor.userId),
    listMilestones(companyId),
  ]);
  const checks: ReadinessCheck[] = [
    { key: 'plan', ok: plan },
    { key: 'provider', ok: providerOk },
    { key: 'domains', ok: sso.emailDomains.length > 0 },
    { key: 'verified', ok: verified },
    { key: 'two_factor', ok: twoFactor },
  ];
  return {
    checks,
    ready: checks.every((c) => c.ok),
    requestedAt: milestones.find((m) => m.milestone === 'sso_requested')?.achievedAt ?? null,
  };
}

export async function requestSso(actor: Actor): Promise<{ number: string }> {
  if (actor.role !== 'owner' || !actor.companyId) throw new ForbiddenError();
  const readiness = await ssoReadiness(actor);
  if (!readiness.ready)
    throw new ValidationError('Finish the checklist before you ask for activation.');
  if (readiness.requestedAt) throw new ValidationError('The activation was already requested.');
  const sso = (await getSection(actor.companyId, 'sso')).value;
  const ticket = await createTicket(actor, {
    subject: 'Single sign-on activation',
    category: 'account',
    priority: 'normal',
    body: [
      `Please activate single sign-on for our company.`,
      `Standard: ${sso.protocol === 'saml' ? 'SAML 2.0' : 'OpenID Connect'}`,
      `Provider: ${sso.providerName || 'not named'}`,
      `E-mail domains: ${sso.emailDomains.join(', ')}`,
      `Staff must use it: ${sso.enforceForStaff ? 'yes' : 'no'}`,
    ].join('\n'),
  });
  await recordMilestone(actor.companyId, 'sso_requested');
  await getService('audit').record({
    action: 'sso.activation_requested',
    resourceType: 'company',
    resourceId: actor.companyId,
    companyId: actor.companyId,
    metadata: { ticket: ticket.number, by: actor.userId },
  });
  return { number: ticket.number };
}
