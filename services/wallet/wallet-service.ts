// path: services/wallet/wallet-service.ts
// The `wallet` contract (credit, debit, hold, release) and the reads the screens need. A company has one wallet; it is
// made when the company's KYC is approved (STEP 14.2 does that) or the first time it is asked for by a trusted service.
import 'server-only';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { creditLegs, debitLegs, holdLegs } from '@/lib/payment/wallet';
import { toInt } from '@/lib/reports/numbers';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { LedgerEntryInput, WalletService } from '@/types/contracts';
import { post, releaseHold } from './ledger';

export interface WalletView {
  id: string;
  companyId: string;
  status: 'active' | 'frozen' | 'closed';
  available: string;
  held: string;
  lowBalanceThreshold: string | null;
  version: number;
}

const COLUMNS =
  'id, company_id, status, available_balance, held_balance, low_balance_threshold, version';

function toView(r: Record<string, unknown>): WalletView {
  return {
    id: String(r.id),
    companyId: String(r.company_id),
    status: String(r.status) as WalletView['status'],
    available: Money.parseRounded(String(r.available_balance)).toDbString(),
    held: Money.parseRounded(String(r.held_balance)).toDbString(),
    lowBalanceThreshold:
      r.low_balance_threshold === null || r.low_balance_threshold === undefined
        ? null
        : Money.parseRounded(String(r.low_balance_threshold)).toDbString(),
    version: toInt(r.version, 1),
  };
}

export async function getWallet(companyId: string): Promise<WalletView | null> {
  const { data, error } = await getAdminSupabase()
    .from('wallets')
    .select(COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  return data ? toView(data) : null;
}

/** The wallet of the company; made when it does not exist yet (safe when two callers ask at once). */
export async function ensureWallet(companyId: string): Promise<WalletView> {
  const existing = await getWallet(companyId);
  if (existing) return existing;
  const { error } = await getAdminSupabase().from('wallets').insert({ company_id: companyId });
  if (error && error.code !== '23505') throw new InternalError(error);
  const made = await getWallet(companyId);
  if (!made) throw new InternalError(new Error('The wallet could not be made.'));
  return made;
}

async function walletById(walletId: string): Promise<WalletView> {
  const { data, error } = await getAdminSupabase()
    .from('wallets')
    .select(COLUMNS)
    .eq('id', walletId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return toView(data);
}

function safe(input: LedgerEntryInput): { key: string; reason: string; type: string } {
  if (input.amount.isNegative() || input.amount.isZero())
    throw new ValidationError('The amount must be above zero.');
  return {
    key: input.idempotencyKey,
    reason: input.reason.slice(0, 200),
    type: input.referenceType.slice(0, 60),
  };
}

export const walletService: WalletService = {
  async credit(input) {
    const w = await walletById(input.walletId);
    const s = safe(input);
    await post({
      companyId: w.companyId,
      key: s.key,
      reason: s.reason,
      referenceType: s.type,
      referenceId: input.referenceId,
      legs: creditLegs(w.id, input.amount),
      actorId: null,
    });
  },
  async debit(input) {
    const w = await walletById(input.walletId);
    const s = safe(input);
    await post({
      companyId: w.companyId,
      key: s.key,
      reason: s.reason,
      referenceType: s.type,
      referenceId: input.referenceId,
      legs: debitLegs(w.id, input.amount),
      actorId: null,
    });
  },
  async hold(input) {
    const w = await walletById(input.walletId);
    const s = safe(input);
    await post({
      companyId: w.companyId,
      key: s.key,
      reason: s.reason,
      referenceType: s.type,
      referenceId: input.referenceId,
      legs: holdLegs(w.id, input.amount),
      actorId: null,
      hold: {
        walletId: w.id,
        amount: input.amount,
        reason: s.reason,
        source: 'manual',
        releaseAt: input.releaseAt,
      },
    });
  },
  async release(holdId) {
    const { data, error } = await getAdminSupabase()
      .from('wallet_holds')
      .select('company_id')
      .eq('id', holdId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalError(error);
    if (!data) throw new NotFoundError();
    await releaseHold(String(data.company_id), holdId, null);
  },
};

/** Sets (or clears with null) the amount below which the owner is told the available balance is low. */
export async function setLowBalanceThreshold(
  companyId: string,
  amount: Money | null,
): Promise<void> {
  if (amount && amount.isNegative()) throw new ValidationError('The amount cannot be negative.');
  const { error } = await getAdminSupabase()
    .from('wallets')
    .update({ low_balance_threshold: amount ? amount.toDbString() : null, low_alerted_at: null })
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
}
