// path: services/auth/signup-flow.ts
// Sign-up and e-mail verification. Answers are neutral: an address that already exists gets the same reply as a new one.
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { normalizeIdentifier } from '@/lib/auth/lock';
import { getService, tryGetService } from '@/lib/container';
import { getPublicEnv } from '@/lib/env/public';
import { InternalError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { randomHex } from '@/lib/utils/hash';
import { slugify } from '@/lib/utils/slug';
import { lookupUserByEmail } from './credentials';
import { hashIdentifier } from './lock-service';
import { recordLoginEvent } from './login-events';
import { disposableCheck, enforcePasswordRules, rememberPassword } from './password-service';

const log = createLogger({ component: 'signup-flow' });

export const NEUTRAL_SIGNUP_MESSAGE =
  'If the address can be used, we sent a message with a link to confirm it.';

export const signupSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(256),
    fullName: z.string().trim().min(1).max(200),
    companyName: z.string().trim().min(2).max(200),
    acceptTerms: z.literal(true),
    turnstileToken: z.string().min(1).max(4096),
    /** Honeypot: real users never see or fill this field. */
    website: z.string().max(200).default(''),
  })
  .strict();

export const verifyEmailSchema = z
  .object({ tokenHash: z.string().regex(/^[A-Za-z0-9_-]{16,200}$/) })
  .strict();
export const resendSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    turnstileToken: z.string().min(1).max(4096),
  })
  .strict();

async function verificationLink(email: string): Promise<string> {
  const link = await getAdminSupabase().auth.admin.generateLink({ type: 'magiclink', email });
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) throw new InternalError(link.error);
  return `${getPublicEnv().NEXT_PUBLIC_APP_URL}/verify-email?token=${encodeURIComponent(hash)}`;
}

async function sendVerification(email: string, companyId: string | null): Promise<void> {
  const mail = tryGetService('email');
  if (!mail) return;
  const url = await verificationLink(email);
  await mail.send({
    template: 'auth.verify-email',
    to: email,
    companyId,
    data: { verifyUrl: url },
    idempotencyKey: `verify-${randomHex(16)}`,
  });
}

export async function startSignup(input: z.infer<typeof signupSchema>, ip: string): Promise<void> {
  if (input.website.length > 0) return; // bots: pretend success, do nothing
  if (!(await getService('security').verifyTurnstile(input.turnstileToken, ip))) {
    throw new ValidationError('Please complete the security check.', [
      { path: 'turnstileToken', message: 'invalid' },
    ]);
  }
  disposableCheck(input.email);
  await enforcePasswordRules(input.password, input.email);

  const email = normalizeIdentifier(input.email);
  const identifier = await hashIdentifier(email);
  if (await lookupUserByEmail(email)) {
    await recordLoginEvent({
      identifierHash: identifier,
      type: 'signup',
      detail: { outcome: 'existing' },
    });
    return;
  }
  const admin = getAdminSupabase();
  const created = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: false,
  });
  if (created.error || !created.data.user) {
    log.warn('sign-up user creation refused', { code: created.error?.status });
    return; // for example the address exists in Supabase Auth but not in profiles: stay neutral
  }
  const userId = created.data.user.id;
  try {
    const slug = `${slugify(input.companyName, 50) || 'company'}-${randomHex(3)}`;
    const company = await admin
      .from('companies')
      .insert({ name: input.companyName, slug })
      .select('id')
      .single();
    if (company.error) throw new InternalError(company.error);
    const companyId = String(company.data.id);
    const profile = await admin
      .from('profiles')
      .insert({ company_id: companyId, user_id: userId, email, full_name: input.fullName });
    if (profile.error) throw new InternalError(profile.error);
    const membership = await admin
      .from('memberships')
      .insert({ company_id: companyId, user_id: userId, role: 'owner' });
    if (membership.error) throw new InternalError(membership.error);
    const meta = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { company_id: companyId, role: 'owner' },
    });
    if (meta.error) throw new InternalError(meta.error);
    await rememberPassword(userId, companyId, input.password);
    await tryGetService('consent')?.record({
      subject: userId,
      purpose: 'terms',
      version: '1',
      text: 'Terms of service accepted at sign-up',
    });
    await recordLoginEvent({ identifierHash: identifier, type: 'signup', userId, companyId });
    await getService('audit').record({
      action: 'auth.signup',
      resourceType: 'user',
      resourceId: userId,
      companyId,
      metadata: { method: 'password' },
    });
    await sendVerification(email, companyId);
  } catch (error) {
    log.error('sign-up failed; removing the half-created account', { error });
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    throw error;
  }
}

/** Confirms the e-mail address with the one-time token from the link. Never reveals why a token failed. */
export async function confirmEmail(tokenHash: string): Promise<boolean> {
  const publicEnv = getPublicEnv();
  const client = createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
  const { data, error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
  if (error || !data.user || !data.session) return false;
  await getAdminSupabase().auth.admin.signOut(data.session.access_token, 'local');
  const email = data.user.email;
  if (email)
    await recordLoginEvent({
      identifierHash: await hashIdentifier(email),
      type: 'email_verified',
      userId: data.user.id,
    });
  return true;
}

export async function resendVerification(
  input: z.infer<typeof resendSchema>,
  ip: string,
): Promise<void> {
  if (!(await getService('security').verifyTurnstile(input.turnstileToken, ip))) {
    throw new ValidationError('Please complete the security check.', [
      { path: 'turnstileToken', message: 'invalid' },
    ]);
  }
  const user = await lookupUserByEmail(input.email);
  if (!user) return;
  const { data } = await getAdminSupabase().auth.admin.getUserById(user.userId);
  if (!data.user || data.user.email_confirmed_at) return;
  const rate = await getService('security').rateLimit(
    `resend-verification:${user.userId}`,
    'api-default',
  );
  if (!rate.allowed) return;
  await sendVerification(normalizeIdentifier(input.email), user.companyId);
}
