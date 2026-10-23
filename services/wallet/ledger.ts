// path: services/wallet/ledger.ts
// The one door to the ledger: a posting is sent to the database function `kd_wallet_post`, which locks the wallets,
// checks the legs add up to zero and the money is there, writes the legs and moves the balances in one step. This file
// turns the database answers into the platform's errors and tells the owner when a balance runs low or negative.
import 'server-only';
import { getService } from '@/lib/container';
import {
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { assertValidLegs, legsToJson, type Leg } from '@/lib/payment/wallet';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';

const log = createLogger({ component: 'wallet-ledger' });

export interface HoldInput {
  walletId: string;
  amount: Money;
  reason: string;
  source: 'settlement' | 'manual' | 'risk';
  releaseAt: Date;
}

export interface PostInput {
  companyId: string;
  /** Makes a retry post once only (at least 8 characters). */
  key: string;
  reason: string;
  referenceType: string;
  referenceId: string | null;
  legs: readonly Leg[];
  actorId: string | null;
  hold?: HoldInput;
}

export interface PostResult {
  postingId: string;
  /** True when the same key and request were posted before and nothing new was written. */
  replay: boolean;
  holdId: string | null;
  wallets: { walletId: string; available: Money; held: Money; availableChange: Money }[];
}

interface DbWalletAnswer {
  wallet_id: string;
  available: string | number;
  held: string | number;
  available_change: string | number;
}

function mapError(error: { code?: string; message?: string }): never {
  switch (error.code) {
    case '23514':
      throw new ValidationError('There is not enough money in the wallet for this.');
    case '23505':
      throw new ConflictError('This request key was already used for a different request.');
    case 'P0002':
      throw new NotFoundError();
    case '55000':
      throw new ForbiddenError('The wallet is not active.');
    case '22023':
      throw new ValidationError('The money movement is not valid.');
    default:
      throw new InternalError(error);
  }
}

export async function post(input: PostInput): Promise<PostResult> {
  try {
    assertValidLegs(input.legs);
  } catch (thrown) {
    throw new ValidationError(
      thrown instanceof Error ? thrown.message : 'The money movement is not valid.',
    );
  }
  const { data, error } = await getAdminSupabase().rpc('kd_wallet_post', {
    p_company: input.companyId,
    p_key: input.key,
    p_reason: input.reason,
    p_ref_type: input.referenceType,
    p_ref_id: input.referenceId,
    p_legs: legsToJson(input.legs),
    p_actor: input.actorId,
    p_hold: input.hold
      ? {
          wallet_id: input.hold.walletId,
          amount: input.hold.amount.toDbString(),
          reason: input.hold.reason,
          source: input.hold.source,
          release_at: input.hold.releaseAt.toISOString(),
        }
      : null,
  });
  if (error) mapError(error);
  const answer = data as {
    posting_id: string;
    replay: boolean;
    hold_id?: string | null;
    wallets?: DbWalletAnswer[];
  };
  const wallets = (answer.wallets ?? []).map((w) => ({
    walletId: w.wallet_id,
    available: Money.parseRounded(String(w.available)),
    held: Money.parseRounded(String(w.held)),
    availableChange: Money.parseRounded(String(w.available_change)),
  }));
  if (!answer.replay) await alertAfterPost(input.companyId, wallets);
  return {
    postingId: answer.posting_id,
    replay: answer.replay,
    holdId: answer.hold_id ?? null,
    wallets,
  };
}

/** Tells the owner when the available balance goes negative or below the threshold they set (once per crossing). */
async function alertAfterPost(companyId: string, wallets: PostResult['wallets']): Promise<void> {
  for (const w of wallets) {
    const before = w.available.sub(w.availableChange);
    try {
      const { data } = await getAdminSupabase()
        .from('wallets')
        .select('low_balance_threshold')
        .eq('id', w.walletId)
        .maybeSingle();
      const threshold =
        data?.low_balance_threshold === null || data?.low_balance_threshold === undefined
          ? null
          : Money.parseRounded(String(data.low_balance_threshold));
      const patch: Record<string, string> = {};
      if (w.available.isNegative() && !before.isNegative()) {
        patch.negative_alerted_at = new Date().toISOString();
        await getService('notification').notify({
          companyId,
          type: 'wallet.negative',
          title: 'Your wallet balance is below zero',
          body: 'A chargeback or refund took your available balance below zero. Future payments will pay it back first.',
          href: '/wallet',
        });
      } else if (
        threshold &&
        w.available.lt(threshold) &&
        !w.available.isNegative() &&
        !before.lt(threshold)
      ) {
        patch.low_alerted_at = new Date().toISOString();
        await getService('notification').notify({
          companyId,
          type: 'wallet.low',
          title: 'Your wallet balance is low',
          body: `The available balance fell below ${threshold.toDbString()} USD.`,
          href: '/wallet',
        });
      }
      if (Object.keys(patch).length > 0)
        await getAdminSupabase().from('wallets').update(patch).eq('id', w.walletId);
    } catch {
      log.error('wallet alert failed', {});
    }
  }
}

/** Releases a hold: held money becomes available. Safe to call twice. */
export async function releaseHold(
  companyId: string,
  holdId: string,
  actorId: string | null,
): Promise<boolean> {
  const { data, error } = await getAdminSupabase().rpc('kd_wallet_release_hold', {
    p_company: companyId,
    p_hold: holdId,
    p_actor: actorId,
  });
  if (error) mapError(error);
  return (data as { released?: boolean } | null)?.released === true;
}

/** Wallets whose balance differs from their ledger (should always be empty). */
export async function verifyWallets(): Promise<string[]> {
  const { data, error } = await getAdminSupabase().rpc('kd_wallet_verify');
  if (error) throw new InternalError(error);
  return ((data ?? []) as { wallet_id: string }[]).map((r) => r.wallet_id);
}
