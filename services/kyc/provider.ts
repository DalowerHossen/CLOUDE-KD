// path: services/kyc/provider.ts
// Automatic verification through an online identity service (Sumsub). The owner is sent to the service's own page; the
// service tells us the result by webhook. A passed check does not approve the business by itself: it lets a reviewer
// recommend approval, and the final approval chain still decides. A webhook is accepted only with a valid signature.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import {
  readLink,
  readWebhook,
  requestSignature,
  SUMSUB_API,
  linkPath,
  verifyWebhookDigest,
} from '@/lib/kyc/sumsub';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { editableSubmission } from '@/services/kyc/owner';
import { getKycProfile, getProviderKeys } from '@/services/kyc/settings';
import type { Actor } from '@/types/contracts';

const log = createLogger({ service: 'kyc-provider' });
const LINK_TTL_SECONDS = 24 * 3600;
const REQUEST_TIMEOUT_MS = 10_000;

/** Asks the service for a secure page for this owner and remembers that the check was started. */
export async function startProviderCheck(actor: Actor): Promise<{ url: string }> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const profile = await getKycProfile();
  if (profile.mode !== 'automatic' || profile.provider !== 'sumsub')
    throw new ValidationError('Online verification is not switched on.');
  const keys = await getProviderKeys();
  if (!keys || !keys.appToken || !keys.secretKey || !keys.levelName)
    throw new ValidationError('Online verification is not set up yet. Please contact support.');
  const submission = await editableSubmission(companyId);
  const path = linkPath(keys.levelName, submission.id, LINK_TTL_SECONDS);
  const ts = Math.floor(Date.now() / 1000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let url: string | null = null;
  try {
    const response = await fetch(`${SUMSUB_API}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'X-App-Token': keys.appToken,
        'X-App-Access-Ts': String(ts),
        'X-App-Access-Sig': await requestSignature(keys.secretKey, ts, 'POST', path, ''),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      log.warn('The verification service refused the request.', { status: response.status });
    } else {
      url = readLink(await response.json().catch(() => null));
    }
  } catch (error) {
    log.warn('The verification service could not be reached.', {
      reason: error instanceof Error ? error.name : 'unknown',
    });
  } finally {
    clearTimeout(timer);
  }
  if (!url)
    throw new ValidationError('The identity check could not be started. Try again in a moment.');
  const { error } = await getAdminSupabase()
    .from('kyc_submissions')
    .update({ verification_mode: 'automatic', provider_status: 'created' })
    .eq('id', submission.id)
    .eq('company_id', companyId);
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'kyc.provider_check_started',
    resourceType: 'kyc_submission',
    resourceId: submission.id,
    companyId,
    metadata: { provider: 'sumsub', by: actor.userId },
  });
  return { url };
}

export type WebhookResult = 'applied' | 'ignored' | 'bad_signature';

/** Applies one webhook of the service. Repeated deliveries do no harm: every change names the states it may leave. */
export async function handleProviderWebhook(
  rawBody: string,
  digest: string | null,
  algorithm: string | null,
): Promise<WebhookResult> {
  const keys = await getProviderKeys();
  if (!keys || !(await verifyWebhookDigest(keys.webhookSecret, rawBody, digest, algorithm)))
    return 'bad_signature';
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return 'ignored';
  }
  const event = readWebhook(json);
  if (!event || !/^[0-9a-f-]{36}$/.test(event.externalUserId)) return 'ignored';
  const admin = getAdminSupabase();
  const found = await admin
    .from('kyc_submissions')
    .select('id, company_id, status, round, submitted_at')
    .eq('id', event.externalUserId)
    .eq('verification_mode', 'automatic')
    .is('deleted_at', null)
    .maybeSingle();
  if (found.error) throw new InternalError(found.error);
  if (!found.data) return 'ignored';
  const id = String(found.data.id);
  const companyId = String(found.data.company_id);
  const now = new Date().toISOString();
  const applicant = event.applicantId ? { provider_applicant_id: event.applicantId } : {};
  const open = ['draft', 'changes_requested'];
  let changed = false;
  if (event.outcome === 'approved') {
    const r = await admin
      .from('kyc_submissions')
      .update({
        ...applicant,
        provider_status: 'approved',
        status: 'submitted',
        submitted_at: found.data.submitted_at ?? now,
      })
      .eq('id', id)
      .in('status', ['draft', 'changes_requested', 'submitted'])
      .select('id');
    if (r.error) throw new InternalError(r.error);
    changed = (r.data ?? []).length > 0;
    if (changed)
      await getService('events').publish({
        name: 'kyc.submitted',
        companyId,
        payload: { submissionId: id, round: Number(found.data.round) },
      });
  } else if (event.outcome === 'retry') {
    const r = await admin
      .from('kyc_submissions')
      .update({
        ...applicant,
        provider_status: 'retry',
        status: 'changes_requested',
        decision_reason: event.comment || 'The identity check needs to be done again.',
      })
      .eq('id', id)
      .in('status', [...open, 'submitted'])
      .select('id');
    if (r.error) throw new InternalError(r.error);
    changed = (r.data ?? []).length > 0;
  } else if (event.outcome === 'rejected') {
    const r = await admin
      .from('kyc_submissions')
      .update({
        ...applicant,
        provider_status: 'rejected',
        status: 'rejected',
        decided_at: now,
        decision_reason: event.comment || 'The identity check was not passed.',
      })
      .eq('id', id)
      .in('status', [...open, 'submitted'])
      .select('id');
    if (r.error) throw new InternalError(r.error);
    changed = (r.data ?? []).length > 0;
    if (changed)
      await getService('events').publish({
        name: 'kyc.rejected',
        companyId,
        payload: { submissionId: id, changesRequested: false },
      });
  } else if (event.pending) {
    const r = await admin
      .from('kyc_submissions')
      .update({ ...applicant, provider_status: 'pending', status: 'submitted', submitted_at: now })
      .eq('id', id)
      .in('status', open)
      .select('id');
    if (r.error) throw new InternalError(r.error);
    changed = (r.data ?? []).length > 0;
  }
  if (changed)
    await getService('audit').record({
      action: 'kyc.provider_result',
      resourceType: 'kyc_submission',
      resourceId: id,
      companyId,
      metadata: { provider: 'sumsub', outcome: event.outcome ?? 'pending' },
    });
  return changed ? 'applied' : 'ignored';
}
