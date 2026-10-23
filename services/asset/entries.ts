// path: services/asset/entries.ts
// Turns the lines of the pure depreciation rules into a posted journal entry: each line uses the account of the asset's category
// when it has one, else the company's account for the key. The entry is made once per source key.
import 'server-only';
import { resolveAccount } from '@/services/accounting/accounts';
import { postSystemEntry } from '@/services/accounting/journals';
import type { JournalLineInput } from '@/services/accounting/journal-rules';
import type { MappingKey } from '@/config/s15-accounting';
import type { Line } from './depreciation-rules';

export async function postAssetEntry(args: {
  companyId: string;
  date: string;
  memo: string;
  sourceType: string;
  sourceId: string;
  sourceKey: string;
  lines: readonly Line[];
}): Promise<{ entryId: string; replay: boolean }> {
  const cache = new Map<MappingKey, string>();
  const lines: JournalLineInput[] = [];
  for (const l of args.lines) {
    let accountId = l.accountId;
    if (!accountId) {
      const hit = cache.get(l.key);
      accountId = hit ?? (await resolveAccount(args.companyId, l.key));
      cache.set(l.key, accountId);
    }
    lines.push({
      accountId,
      debit: l.side === 'debit' ? l.amount.toDbString() : '0',
      credit: l.side === 'credit' ? l.amount.toDbString() : '0',
      description: l.description,
    });
  }
  return postSystemEntry({
    companyId: args.companyId,
    date: args.date,
    memo: args.memo,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    sourceKey: args.sourceKey,
    lines,
  });
}
