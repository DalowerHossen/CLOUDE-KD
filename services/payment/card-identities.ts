// path: services/payment/card-identities.ts
// Card identity storage, the blocked list and the counts the card rules need. Only HMACs are stored.
import { getService } from '@/lib/container';
import { InternalError, NotFoundError } from '@/lib/errors';
import { getServerEnv } from '@/lib/env';
import {
  evaluateCardRules,
  identityHmac,
  type CardRuleDecision,
  type CardStats,
} from '@/lib/payment/card-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import {
  CARD_FAIL_WINDOW_HOURS,
  CARD_VELOCITY_WINDOW_HOURS,
  SAME_CARD_SAME_INVOICE_HOURS,
} from '@/config/payment-risk';
import type { Actor, CardIdentity, ProcessorId } from '@/types/contracts';
import { mapPaymentDbError } from './rpc';

function hmacKey(): string {
  const key = getServerEnv().CARD_IDENTITY_HMAC_KEY;
  if (!key) throw new InternalError(new Error('CARD_IDENTITY_HMAC_KEY is not set'));
  return key;
}

/** Finds or creates the identity row. Returns the row id and the HMAC. */
export async function resolveIdentity(
  processorId: ProcessorId,
  identity: CardIdentity,
): Promise<{ id: string; hmac: string }> {
  const hmac = identityHmac(hmacKey(), processorId, identity);
  const db = getAdminSupabase();
  const { error: insertError } = await db
    .from('card_identities')
    .upsert(
      { processor_id: processorId, identity_type: identity.type, identity_hmac: hmac },
      { onConflict: 'processor_id,identity_hmac', ignoreDuplicates: true },
    );
  if (insertError) throw mapPaymentDbError(insertError);
  const { data, error } = await db
    .from('card_identities')
    .select('id')
    .eq('processor_id', processorId)
    .eq('identity_hmac', hmac)
    .maybeSingle();
  if (error) throw mapPaymentDbError(error);
  if (!data) throw new NotFoundError();
  return { id: String(data.id), hmac };
}

export async function isBlacklisted(processorId: ProcessorId, hmac: string): Promise<boolean> {
  const { data, error } = await getAdminSupabase()
    .from('card_blacklist')
    .select('id, expires_at')
    .eq('processor_id', processorId)
    .eq('identity_hmac', hmac)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapPaymentDbError(error);
  if (!data) return false;
  return !data.expires_at || new Date(String(data.expires_at)).getTime() > Date.now();
}

export async function cardStats(input: {
  identityId: string | null;
  ip: string;
  invoiceId: string;
}): Promise<CardStats> {
  const { data, error } = await getAdminSupabase().rpc('kd_card_stats', {
    p_identity: input.identityId,
    p_ip: input.ip,
    p_invoice: input.invoiceId,
    p_fail_hours: CARD_FAIL_WINDOW_HOURS,
    p_velocity_hours: CARD_VELOCITY_WINDOW_HOURS,
    p_same_invoice_hours: SAME_CARD_SAME_INVOICE_HOURS,
  });
  if (error) throw mapPaymentDbError(error);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, number> | undefined;
  return {
    countedFailures: row?.counted_failures ?? 0,
    cardAttempts: row?.card_attempts ?? 0,
    ipAttempts: row?.ip_attempts ?? 0,
    ipDistinctCards: row?.ip_distinct_cards ?? 0,
    paidSameInvoice: row?.paid_same_invoice ?? 0,
  };
}

/** The full rule check for a card that is now known. */
export async function checkCard(input: {
  processorId: ProcessorId;
  identity: CardIdentity;
  ip: string;
  invoiceId: string;
}): Promise<{ decision: CardRuleDecision; identityId: string }> {
  const resolved = await resolveIdentity(input.processorId, input.identity);
  const [blacklisted, stats] = await Promise.all([
    isBlacklisted(input.processorId, resolved.hmac),
    cardStats({ identityId: resolved.id, ip: input.ip, invoiceId: input.invoiceId }),
  ]);
  return { decision: evaluateCardRules({ blacklisted, stats }), identityId: resolved.id };
}

/** Adds a card to the blocked list (processor fraud signal, a reviewer's decision, or manual entry). */
export async function blockCard(input: {
  processorId: ProcessorId;
  hmac: string;
  reason: string;
  source: 'manual' | 'processor_fraud_signal' | 'review';
  actorId: string | null;
}): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('card_blacklist')
    .upsert(
      {
        processor_id: input.processorId,
        identity_hmac: input.hmac,
        reason: input.reason.slice(0, 300),
        source: input.source,
        added_by: input.actorId,
      },
      { onConflict: 'processor_id,identity_hmac', ignoreDuplicates: true },
    );
  if (error) throw mapPaymentDbError(error);
}

export async function blockIdentity(
  actor: Actor,
  identityId: string,
  reason: string,
): Promise<void> {
  const { data, error } = await getAdminSupabase()
    .from('card_identities')
    .select('processor_id, identity_hmac')
    .eq('id', identityId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapPaymentDbError(error);
  if (!data) throw new NotFoundError();
  await blockCard({
    processorId: data.processor_id as ProcessorId,
    hmac: String(data.identity_hmac),
    reason,
    source: 'review',
    actorId: actor.userId,
  });
  await getService('audit').record({
    action: 'card.block',
    resourceType: 'card_identity',
    resourceId: identityId,
    metadata: { reason: reason.slice(0, 300) },
  });
}
