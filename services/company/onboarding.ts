// path: services/company/onboarding.ts
// The onboarding wizard (five steps, resumable, skippable) and the setup checklist. Progress is saved after every
// step in the settings sections, so closing the browser loses nothing. Checks of work that belongs to other STEPs
// (first client, first invoice, first payment) are milestones recorded by event handlers or by those STEPs.
import 'server-only';
import { getService, tryGetService } from '@/lib/container';
import { ConflictError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { PRESETS } from '@/lib/company/presets';
import type { SectionValue } from '@/lib/company/sections';
import type { StepInput } from '@/lib/company/steps';
import type { Actor } from '@/types/contracts';
import { getSection, listMilestones, recordMilestone, saveSection } from './settings';

const log = createLogger({ component: 'onboarding' });
const DAY = 86_400_000;
export interface ChecklistItem {
  key: string;
  done: boolean;
  /** Where the item is done. Only addresses that exist are listed. */
  href: string | null;
}

export interface OnboardingView {
  state: SectionValue<'onboarding'>;
  profile: SectionValue<'profile'>;
  branding: SectionValue<'branding'>;
  invoice: SectionValue<'invoice'>;
  checklist: ChecklistItem[];
  percent: number;
  milestones: string[];
}

export async function onboardingView(companyId: string): Promise<OnboardingView> {
  const [onboarding, profile, branding, invoice, milestones] = await Promise.all([
    getSection(companyId, 'onboarding'),
    getSection(companyId, 'profile'),
    getSection(companyId, 'branding'),
    getSection(companyId, 'invoice'),
    listMilestones(companyId),
  ]);
  const got = new Set(milestones.map((m) => m.milestone));
  const items: ChecklistItem[] = [
    {
      key: 'profile',
      done: profile.value.legalName !== '' && profile.value.country !== '',
      href: '/onboarding',
    },
    { key: 'logo', done: branding.value.logoFileId !== null, href: '/onboarding' },
    { key: 'invoice_setup', done: invoice.version > 0, href: '/onboarding' },
    { key: 'first_client', done: got.has('first_client'), href: null },
    { key: 'first_invoice', done: got.has('first_invoice'), href: null },
    { key: 'first_payment', done: got.has('first_payment'), href: null },
  ];
  const done = items.filter((i) => i.done).length;
  return {
    state: onboarding.value,
    profile: profile.value,
    branding: branding.value,
    invoice: invoice.value,
    checklist: items,
    percent: Math.round((done / items.length) * 100),
    milestones: [...got],
  };
}

/** Day 1, 3, 7 and 14 guidance e-mails to the owner, queued once when the wizard starts. */
async function queueGuidance(actor: Actor, companyId: string): Promise<void> {
  const mail = tryGetService('email');
  if (!mail) return;
  const name = actor.email.split('@')[0] ?? '';
  try {
    for (const days of [1, 3, 7, 14])
      await mail.enqueue({
        template: `notification.onboarding-day-${days}`,
        to: actor.email,
        companyId,
        data: { name },
        idempotencyKey: `onboarding-${companyId}-${days}`,
        sendAt: new Date(Date.now() + days * DAY),
      });
  } catch (error) {
    log.warn('guidance e-mails not queued', {
      error: error instanceof Error ? error.message : 'failed',
    });
  }
}

async function setOnboarding(
  actor: Actor,
  patch: Partial<SectionValue<'onboarding'>>,
): Promise<SectionValue<'onboarding'>> {
  const companyId = actor.companyId as string;
  const current = await getSection(companyId, 'onboarding');
  const next = { ...current.value, ...patch };
  await saveSection(actor, 'onboarding', next, current.version);
  return next;
}

/** Marks the wizard as started the first time it is opened. */
export async function startOnboarding(actor: Actor): Promise<void> {
  if (!actor.companyId) throw new ValidationError('A company is needed.');
  const current = await getSection(actor.companyId, 'onboarding');
  if (current.value.status !== 'not_started') return;
  try {
    await setOnboarding(actor, { status: 'in_progress', startedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof ConflictError) return; // another tab started it
    throw error;
  }
  await queueGuidance(actor, actor.companyId);
}

export async function applyStep(actor: Actor, input: StepInput): Promise<OnboardingView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  if ('action' in input) {
    if (input.action === 'skip')
      await setOnboarding(actor, { status: 'skipped', finishedAt: new Date().toISOString() });
    else await setOnboarding(actor, { status: 'in_progress', finishedAt: null });
    return onboardingView(companyId);
  }
  switch (input.step) {
    case 1: {
      const profile = await getSection(companyId, 'profile');
      const { step: _s, ...fields } = input;
      await saveSection(actor, 'profile', { ...profile.value, ...fields }, profile.version);
      break;
    }
    case 2:
      break;
    case 3: {
      const branding = await getSection(companyId, 'branding');
      const { step: _s, ...fields } = input;
      await saveSection(actor, 'branding', { ...branding.value, ...fields }, branding.version);
      break;
    }
    case 4: {
      const [invoice, profile] = await Promise.all([
        getSection(companyId, 'invoice'),
        getSection(companyId, 'profile'),
      ]);
      const preset =
        input.usePreset && profile.value.industry ? PRESETS[profile.value.industry].invoice : null;
      await saveSection(
        actor,
        'invoice',
        {
          ...invoice.value,
          invoicePrefix: input.invoicePrefix,
          numbering: input.numbering,
          dueDays: preset ? preset.dueDays : input.dueDays,
          terms: preset ? preset.terms : input.terms,
          notes: preset ? preset.notes : input.notes,
        },
        invoice.version,
      );
      break;
    }
    case 5:
      await setOnboarding(actor, {
        paymentsSkipped: input.paymentsSkipped,
        status: 'completed',
        step: 5,
        finishedAt: new Date().toISOString(),
      });
      if (await recordMilestone(companyId, 'onboarding_completed'))
        await getService('notification').notify({
          companyId,
          type: 'onboarding.completed',
          title: 'Your workspace is ready',
          body: 'Setup is finished. You can change every choice later in the settings.',
        });
      return onboardingView(companyId);
  }
  const onboarding = await getSection(companyId, 'onboarding');
  if (input.step >= onboarding.value.step || onboarding.value.status === 'not_started')
    await setOnboarding(actor, {
      status: 'in_progress',
      step: Math.min(5, input.step + 1),
      startedAt: onboarding.value.startedAt ?? new Date().toISOString(),
    });
  return onboardingView(companyId);
}
