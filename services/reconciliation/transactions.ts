// path: services/reconciliation/transactions.ts
// Getting bank lines in: a statement file (CSV, OFX, QFX) or a batch from a bank feed (STEP 16 calls `importFeedBatch`). The
// same file is refused twice; a line already imported (even from an overlapping file) is skipped; lines that match a bank rule
// are booked at once. Only the lines are kept, never the whole file.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, ValidationError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { getBankAccount } from './bank-accounts';
import { importInput } from './inputs';
import { ruleFor } from './matching-rules';
import { categorize, txnView, type BankTxnView } from './matching';
import { listRules } from './rules';
import { dedupeKeys, fileHash, parseStatement, type ParsedTxn } from './statement-parsers';

const log = createLogger({ component: 'bank-import' });

export interface ImportResult {
  importId: string;
  format: string;
  rows: number;
  imported: number;
  skipped: number;
  booked: number;
  errors: { line: number; message: string }[];
  endingBalance: string | null;
}

async function ingest(
  companyId: string,
  bankAccountId: string,
  source: 'csv' | 'ofx' | 'qfx' | 'feed',
  fileName: string,
  hash: string,
  txns: readonly ParsedTxn[],
  endingBalance: string | null,
  errors: ImportResult['errors'],
  by: string | null,
  actor: Actor | null,
): Promise<ImportResult> {
  const admin = getAdminSupabase();
  const account = await getBankAccount(companyId, bankAccountId);
  if (account.status !== 'active') throw new ConflictError('The bank account is closed.');
  const dates = txns.map((t) => t.date).sort();
  const imp = await admin
    .from('bank_imports')
    .insert({
      company_id: companyId,
      bank_account_id: bankAccountId,
      source,
      file_name: fileName,
      file_hash: hash,
      row_count: txns.length,
      period_from: dates[0] ?? null,
      period_to: dates.at(-1) ?? null,
      ending_balance: endingBalance,
      imported_by: by,
    })
    .select('id')
    .single();
  if (imp.error) {
    if (imp.error.code === '23505')
      throw new ConflictError('This file was already imported for this bank account.');
    mapAccountingError(imp.error);
  }
  const importId = String((imp.data as { id: string }).id);
  const keys = dedupeKeys(bankAccountId, txns);
  const have = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data, error } = await admin
      .from('bank_transactions')
      .select('dedupe_hash')
      .eq('bank_account_id', bankAccountId)
      .in('dedupe_hash', keys.slice(i, i + 200))
      .is('deleted_at', null);
    if (error) throw new InternalError(error);
    for (const r of data ?? []) have.add(String(r.dedupe_hash));
  }
  const fresh = txns.map((t, i) => ({ t, key: keys[i] ?? '' })).filter((x) => !have.has(x.key));
  const inserted: BankTxnView[] = [];
  for (let i = 0; i < fresh.length; i += 200) {
    const batch = fresh
      .slice(i, i + 200)
      .map(({ t, key }) => ({
        company_id: companyId,
        bank_account_id: bankAccountId,
        import_id: importId,
        txn_date: t.date,
        description: t.description,
        reference: t.reference,
        external_id: t.externalId,
        amount: t.amount,
        balance_after: t.balance,
        dedupe_hash: key,
      }));
    const { data, error } = await admin
      .from('bank_transactions')
      .insert(batch)
      .select(
        'id, bank_account_id, txn_date, description, reference, amount, status, reconciliation_id, note',
      );
    if (error) {
      if (error.code !== '23505') throw new InternalError(error);
      // Two imports at once: fall back to one line at a time and skip the ones that exist.
      for (const row of batch) {
        const one = await admin
          .from('bank_transactions')
          .insert(row)
          .select(
            'id, bank_account_id, txn_date, description, reference, amount, status, reconciliation_id, note',
          )
          .single();
        if (one.data) inserted.push(txnView(one.data as unknown as Parameters<typeof txnView>[0]));
      }
      continue;
    }
    for (const r of data ?? [])
      inserted.push(txnView(r as unknown as Parameters<typeof txnView>[0]));
  }
  let booked = 0;
  const rules = await listRules(companyId);
  if (rules.length > 0) {
    for (const t of inserted) {
      const rule = ruleFor(rules, bankAccountId, {
        id: t.id,
        date: t.date,
        amount: t.amount,
        description: t.description,
        reference: t.reference,
      });
      if (!rule) continue;
      try {
        await categorize(
          actor,
          companyId,
          t.id,
          { accountId: rule.accountId, memo: rule.memo },
          'rule',
        );
        booked += 1;
      } catch (error) {
        log.error('rule could not book the line', {
          txn: t.id,
          rule: rule.id,
          error: String(error),
        });
      }
    }
  }
  const up = await admin
    .from('bank_imports')
    .update({ imported_count: inserted.length, skipped_count: txns.length - inserted.length })
    .eq('id', importId);
  if (up.error) log.error('import counts not saved', { importId, error: up.error.message });
  await getService('audit').record({
    action: 'bank.imported',
    resourceType: 'bank_import',
    resourceId: importId,
    companyId,
    metadata: { source, rows: txns.length, imported: inserted.length, booked },
  });
  return {
    importId,
    format: source,
    rows: txns.length,
    imported: inserted.length,
    skipped: txns.length - inserted.length,
    booked,
    errors,
    endingBalance,
  };
}

export async function importStatement(actor: Actor, input: unknown): Promise<ImportResult> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = importInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The file is not valid.');
  const d = parsed.data;
  const statement = parseStatement(d.fileName, d.text, d.dateFormat);
  if (statement.transactions.length === 0)
    throw new ValidationError(statement.errors[0]?.message ?? 'No lines were found in the file.');
  return ingest(
    companyId,
    d.bankAccountId,
    statement.format,
    d.fileName,
    fileHash(d.text),
    statement.transactions,
    statement.endingBalance,
    statement.errors,
    actor.userId,
    actor,
  );
}

/** For the bank feed service (STEP 16): a batch of lines already read from the bank. The batch id makes a repeat harmless. */
export async function importFeedBatch(
  companyId: string,
  bankAccountId: string,
  batchId: string,
  txns: readonly ParsedTxn[],
): Promise<ImportResult> {
  if (txns.length === 0 || txns.length > 5000)
    throw new ValidationError('A batch has between 1 and 5000 lines.');
  return ingest(
    companyId,
    bankAccountId,
    'feed',
    `feed:${batchId}`.slice(0, 200),
    fileHash(`feed:${bankAccountId}:${batchId}`),
    txns,
    null,
    [],
    null,
    null,
  );
}

export interface TxnFilter {
  status?: 'unmatched' | 'matched' | 'ignored';
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listTransactions(
  companyId: string,
  bankAccountId: string,
  f: TxnFilter = {},
): Promise<{ rows: BankTxnView[]; total: number }> {
  let q = getAdminSupabase()
    .from('bank_transactions')
    .select(
      'id, bank_account_id, txn_date, description, reference, amount, status, reconciliation_id, note',
      { count: 'exact' },
    )
    .eq('company_id', companyId)
    .eq('bank_account_id', bankAccountId)
    .is('deleted_at', null)
    .order('txn_date', { ascending: false });
  if (f.status) q = q.eq('status', f.status);
  if (f.from) q = q.gte('txn_date', f.from);
  if (f.to) q = q.lte('txn_date', f.to);
  const limit = Math.min(Math.max(f.limit ?? 100, 1), 500);
  const offset = Math.max(f.offset ?? 0, 0);
  const { data, error, count } = await q.range(offset, offset + limit - 1);
  if (error) throw new InternalError(error);
  return {
    rows: (data ?? []).map((r) => txnView(r as unknown as Parameters<typeof txnView>[0])),
    total: count ?? 0,
  };
}
