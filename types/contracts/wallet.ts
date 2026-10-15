// path: types/contracts/wallet.ts
import type { Uuid } from './common';
import type { Money } from '@/lib/utils/currency';

export interface LedgerEntryInput {
  walletId: Uuid;
  amount: Money;
  reason: string;
  referenceType: string;
  referenceId: Uuid;
  idempotencyKey: string;
}

export interface WalletService {
  credit(input: LedgerEntryInput): Promise<void>;
  debit(input: LedgerEntryInput): Promise<void>;
  hold(input: LedgerEntryInput & { releaseAt: Date }): Promise<void>;
  release(holdId: Uuid): Promise<void>;
}
