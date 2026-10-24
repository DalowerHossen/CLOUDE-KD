// path: services/gateway/entries.ts
// Entries of the settlement ledger. The owner posts a batch (up to 200) for one sub-merchant. Each entry is worked out with the terms
// in force at its time and kept with the result, so a later change of terms never changes it. An entry is known by its kind and its
// reference: posting the same entry again changes nothing and is reported as a duplicate.
import 'server-only';
import { InternalError, ValidationError } from '@/lib/errors';
import { entriesBatch, workOutEntry, type StatementRow } from '@/lib/gateway/split-rules';
import { SETTLEMENT_STATEMENT_ROWS } from '@/config/s16-settlement';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { need, record } from './db';
import { getSubMerchant } from './sub-merchants';
import { listTerms } from './terms';
import { termsAt, NO_TERMS } from '@/lib/gateway/split-rules';

export interface PostResult {
  posted: number;
  duplicates: string[];
  failed: { externalRef: string; message: string }[];
}

export async function postEntries(actor: Actor, input: unknown): Promise<PostResult> {
  const companyId = need(actor);
  const parsed = entriesBatch.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The entries are not valid.');
  const { subMerchantId, entries } = parsed.data;
  const sub = await getSubMerchant(companyId, subMerchantId);
  if (sub.status === 'closed')
    throw new ValidationError('A closed sub-merchant takes no new entries.');
  const versions = await listTerms(companyId);
  const admin = getAdminSupabase();
  const result: PostResult = { posted: 0, duplicates: [], failed: [] };
  for (const e of entries) {
    const occurred = new Date(e.occurredAt);
    const terms = termsAt(versions, subMerchantId, occurred) ?? NO_TERMS;
    let worked;
    try {
      worked = workOutEntry(e.kind, e.amount, terms, occurred);
    } catch (error) {
      result.failed.push({
        externalRef: e.externalRef,
        message: error instanceof RangeError ? error.message : 'The entry is not valid.',
      });
      continue;
    }
    const { error } = await admin.from('settlement_entries').insert({
      company_id: companyId,
      sub_merchant_id: subMerchantId,
      kind: worked.kind,
      gross: worked.gross,
      commission: worked.commission,
      fixed_fee: worked.fixedFee,
      net: worked.net,
      external_ref: e.externalRef,
      occurred_at: occurred.toISOString(),
      available_at: worked.availableAt,
      terms_id: worked.termsId,
      note: e.note,
      created_by: actor.userId,
    });
    if (error) {
      if (error.code === '23505') result.duplicates.push(e.externalRef);
      else throw new InternalError(error);
    } else {
      result.posted += 1;
    }
  }
  await record(companyId, 'settlement.entries_posted', 'settlement_entry', null, {
    subMerchantId,
    posted: result.posted,
    duplicates: result.duplicates.length,
    failed: result.failed.length,
  });
  return result;
}

export interface EntryView extends StatementRow {
  id: string;
}

/** Entries of a sub-merchant, newest first; `before` pages backwards. Amounts are exact text. */
export async function listEntries(
  companyId: string,
  subMerchantId: string,
  limit: number,
  before: string | null,
): Promise<EntryView[]> {
  await getSubMerchant(companyId, subMerchantId);
  const { data, error } = await getAdminSupabase().rpc('kd_settlement_entries_text', {
    p_company: companyId,
    p_sub: subMerchantId,
    p_limit: Math.min(Math.max(limit, 1), SETTLEMENT_STATEMENT_ROWS),
    p_before: before,
  });
  if (error) throw new InternalError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    occurredAt: String(r.occurred_at),
    kind: String(r.kind),
    externalRef: String(r.external_ref),
    gross: String(r.gross),
    commission: String(r.commission),
    fixedFee: String(r.fixed_fee),
    net: String(r.net),
    availableAt: String(r.available_at),
    note: String(r.note),
  }));
}
