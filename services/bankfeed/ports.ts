// path: services/bankfeed/ports.ts
// The only place where the bank feed calls into STEP 15 (request R2): the bank accounts of the books, and `importFeedBatch` of the
// reconciliation service, which takes a batch of lines, skips the ones it has (by their ids) and books the ones a bank rule
// matches. Matching suggestions, one-click accept and the reconciliation report stay in STEP 15. If the Integrator replaces these
// calls with an event, this is the only file that changes.
import 'server-only';
import { ConflictError } from '@/lib/errors';
import type { FeedLine } from '@/lib/integrations/bank-rules';
import { getBankAccount, listBankAccounts } from '@/services/reconciliation/bank-accounts';
import { importFeedBatch } from '@/services/reconciliation/transactions';

export interface BookAccount {
  id: string;
  name: string;
  bankName: string;
  last4: string | null;
  status: 'active' | 'closed';
}

const view = (a: Awaited<ReturnType<typeof getBankAccount>>): BookAccount => ({
  id: a.id,
  name: a.name,
  bankName: a.bankName,
  last4: a.last4,
  status: a.status,
});

export async function bookAccounts(companyId: string): Promise<BookAccount[]> {
  return (await listBankAccounts(companyId)).map(view);
}

/** A bank account of the books (NotFound from the owning service when it is not the company's). */
export async function bookAccount(companyId: string, id: string): Promise<BookAccount> {
  return view(await getBankAccount(companyId, id));
}

export interface ImportOutcome {
  imported: number;
  skipped: number;
  booked: number;
  repeat: boolean;
}

/** Imports one batch. A batch that was imported before answers `repeat` and changes nothing. */
export async function importBatch(
  companyId: string,
  bankAccountId: string,
  batchId: string,
  lines: readonly FeedLine[],
): Promise<ImportOutcome> {
  try {
    const r = await importFeedBatch(
      companyId,
      bankAccountId,
      batchId,
      lines.map((l) => ({
        date: l.date,
        description: l.description,
        reference: l.reference,
        externalId: l.externalId,
        amount: l.amount,
        balance: l.balance,
      })),
    );
    return { imported: r.imported, skipped: r.skipped, booked: r.booked, repeat: false };
  } catch (error) {
    if (error instanceof ConflictError && /already imported/i.test(error.message))
      return { imported: 0, skipped: lines.length, booked: 0, repeat: true };
    throw error;
  }
}
