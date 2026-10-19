// path: lib/payment/wallet.ts
// The ledger vocabulary of the wallet: the accounts, the legs of a posting and the standard postings (credit, debit,
// hold, release). Pure functions over `Money`, so the maths can be checked without a database.
// Sign convention: a positive leg on a company account is money the platform owes to the company; the counter legs on
// the platform accounts carry the opposite sign, so the legs of every posting add up to zero.
import { Money } from '@/lib/utils/currency';

export const COMPANY_ACCOUNTS = ['available', 'held'] as const;
export const PLATFORM_ACCOUNTS = [
  'processor_receivable',
  'platform_fee_revenue',
  'processor_fee_expense',
  'payout_in_transit',
  'clearing',
] as const;
export type CompanyAccount = (typeof COMPANY_ACCOUNTS)[number];
export type PlatformAccount = (typeof PLATFORM_ACCOUNTS)[number];
export type LedgerAccount = CompanyAccount | PlatformAccount;

export function isCompanyAccount(account: LedgerAccount): account is CompanyAccount {
  return (COMPANY_ACCOUNTS as readonly string[]).includes(account);
}

export interface Leg {
  /** Set for company accounts, null for platform accounts. */
  walletId: string | null;
  account: LedgerAccount;
  /** Signed. Never zero. */
  amount: Money;
  /** False lets a company account go below zero (a chargeback). Default true. */
  floor?: boolean;
}

export const MAX_LEGS = 12;

/** Throws when the legs cannot be one posting: too few or many, a zero leg, a wrong wallet, or a sum that is not zero. */
export function assertValidLegs(legs: readonly Leg[]): void {
  if (legs.length < 2 || legs.length > MAX_LEGS)
    throw new RangeError('A posting needs between 2 and 12 legs.');
  let sum = Money.zero();
  for (const leg of legs) {
    if (leg.amount.isZero()) throw new RangeError('A leg cannot be zero.');
    if (isCompanyAccount(leg.account) !== (leg.walletId !== null))
      throw new RangeError(
        'Company accounts need a wallet and platform accounts must not have one.',
      );
    sum = sum.add(leg.amount);
  }
  if (!sum.isZero()) throw new RangeError(`The legs add up to ${sum.toDbString()}, not zero.`);
}

/** The legs as the posting function reads them. */
export function legsToJson(legs: readonly Leg[]): Record<string, unknown>[] {
  return legs.map((l) => ({
    wallet_id: l.walletId,
    account: l.account,
    amount: l.amount.toDbString(),
    ...(l.floor === false ? { floor: false } : {}),
  }));
}

function positive(amount: Money): Money {
  if (!amount.isPositive()) throw new RangeError('The amount must be above zero.');
  return amount;
}

/** Money comes into the wallet (the counter leg is the platform `clearing` account). */
export function creditLegs(walletId: string, amount: Money): Leg[] {
  const a = positive(amount);
  return [
    { walletId, account: 'available', amount: a },
    { walletId: null, account: 'clearing', amount: a.negate() },
  ];
}

/** Money goes out of the wallet. `allowNegative` is for a chargeback only. */
export function debitLegs(walletId: string, amount: Money, allowNegative = false): Leg[] {
  const a = positive(amount);
  return [
    {
      walletId,
      account: 'available',
      amount: a.negate(),
      ...(allowNegative ? { floor: false } : {}),
    },
    { walletId: null, account: 'clearing', amount: a },
  ];
}

/** Sets money aside: available becomes held. */
export function holdLegs(walletId: string, amount: Money): Leg[] {
  const a = positive(amount);
  return [
    { walletId, account: 'available', amount: a.negate() },
    { walletId, account: 'held', amount: a },
  ];
}

/** Gives held money back to available. */
export function releaseLegs(walletId: string, amount: Money): Leg[] {
  const a = positive(amount);
  return [
    { walletId, account: 'held', amount: a.negate() },
    { walletId, account: 'available', amount: a },
  ];
}

/** The balance of an account is the sum of its legs. */
export function balanceOf(
  legs: readonly Pick<Leg, 'walletId' | 'account' | 'amount'>[],
  walletId: string,
  account: CompanyAccount,
): Money {
  return legs
    .filter((l) => l.walletId === walletId && l.account === account)
    .reduce((acc, l) => acc.add(l.amount), Money.zero());
}
