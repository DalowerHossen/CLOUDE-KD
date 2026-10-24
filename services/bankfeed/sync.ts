// path: services/bankfeed/sync.ts
// Getting the lines of a bank link into the books. Plaid: /transactions/sync from the saved cursor (the cursor moves only after
// the lines were imported). Salt Edge: the transactions of each mapped account from the last id seen. Lines are read into one shape
// (a pending line, a duplicate and another currency are left out), cut into batches whose key is made from the ids of their lines,
// and handed to the reconciliation service through the port. A batch that was imported before changes nothing, so a repeat run,
// a repeated webhook or a second worker is harmless.
import 'server-only';
import {
  BANKFEED_IMPORT_CHUNK,
  BANKFEED_SYNC_BATCH,
  BANKFEED_SYNC_EVERY_HOURS,
} from '@/config/s16-bankfeed';
import { ConflictError, InternalError } from '@/lib/errors';
import {
  batchKeyOf,
  chunk,
  readPlaidTransaction,
  readSaltEdgeTransaction,
  readTransactions,
  type FeedLine,
  type LineVerdict,
} from '@/lib/integrations/bank-rules';
import { CommerceApiError } from '@/lib/integrations/commerce-http';
import * as plaid from '@/lib/integrations/plaid';
import * as saltedge from '@/lib/integrations/saltedge';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { mapIntegrationError } from '@/services/publicapi/db-errors';
import {
  markError,
  markNeedsReauth,
  plaidKeys,
  saltedgeKeys,
  secretsOf,
  type Secrets,
} from './connections';
import { record } from './db';
import { importBatch } from './ports';

const log = createLogger({ component: 'bankfeed-sync' });

export interface SyncSummary {
  accounts: number;
  lines: number;
  imported: number;
  skipped: number;
  leftOut: number;
  removed: number;
  repeats: number;
}

const empty = (): SyncSummary => ({
  accounts: 0,
  lines: 0,
  imported: 0,
  skipped: 0,
  leftOut: 0,
  removed: 0,
  repeats: 0,
});

interface FeedAccount {
  id: string;
  externalId: string;
  bankAccountId: string;
  cursor: string | null;
}

async function mappedAccounts(companyId: string, connectionId: string): Promise<FeedAccount[]> {
  const { data, error } = await getAdminSupabase()
    .from('bank_feed_accounts')
    .select('id, external_id, bank_account_id, sync_cursor')
    .eq('company_id', companyId)
    .eq('connection_id', connectionId)
    .eq('enabled', true)
    .not('bank_account_id', 'is', null)
    .is('deleted_at', null);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    externalId: String(r.external_id),
    bankAccountId: String(r.bank_account_id),
    cursor: r.sync_cursor === null ? null : String(r.sync_cursor),
  }));
}

/** Imports the lines of one account in batches. Returns the counts. */
async function importLines(
  companyId: string,
  connectionId: string,
  account: FeedAccount,
  lines: readonly FeedLine[],
): Promise<Pick<SyncSummary, 'imported' | 'skipped' | 'repeats'>> {
  const admin = getAdminSupabase();
  const out = { imported: 0, skipped: 0, repeats: 0 };
  for (const part of chunk(lines, BANKFEED_IMPORT_CHUNK)) {
    const key = batchKeyOf(part);
    const known = await admin
      .from('bank_feed_batches')
      .select('id')
      .eq('feed_account_id', account.id)
      .eq('batch_key', key)
      .maybeSingle();
    if (known.error) throw new InternalError(known.error);
    if (known.data) {
      out.repeats += 1;
      out.skipped += part.length;
      continue;
    }
    const r = await importBatch(companyId, account.bankAccountId, `${account.id}:${key}`, part);
    out.imported += r.imported;
    out.skipped += r.skipped;
    if (r.repeat) out.repeats += 1;
    const saved = await admin.from('bank_feed_batches').insert({
      company_id: companyId,
      connection_id: connectionId,
      feed_account_id: account.id,
      batch_key: key,
      line_count: part.length,
      imported_count: r.imported,
      skipped_count: r.skipped,
      booked_count: r.booked,
    });
    if (saved.error && saved.error.code !== '23505') mapIntegrationError(saved.error);
  }
  return out;
}

async function syncPlaid(
  companyId: string,
  secrets: Secrets,
  accounts: FeedAccount[],
): Promise<SyncSummary> {
  const row = secrets.row;
  const token = secrets.link.accessToken;
  if (token === undefined) throw new ConflictError('The bank link has no access.');
  const result = await plaid.syncTransactions(plaidKeys(secrets), token, row.sync_cursor ?? '');
  const sum = empty();
  sum.removed = result.removed;
  for (const [externalId, list] of result.byAccount) {
    const account = accounts.find((a) => a.externalId === externalId);
    if (!account) {
      sum.leftOut += list.length;
      continue;
    }
    const read = readTransactions(list, readPlaidTransaction as (t: unknown) => LineVerdict);
    sum.accounts += 1;
    sum.lines += read.lines.length;
    sum.leftOut +=
      read.left.pending +
      read.left.currency +
      read.left.invalid +
      read.left.zero +
      read.left.duplicate;
    const done = await importLines(companyId, row.id, account, read.lines);
    sum.imported += done.imported;
    sum.skipped += done.skipped;
    sum.repeats += done.repeats;
    await getAdminSupabase()
      .from('bank_feed_accounts')
      .update({ last_imported_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', account.id);
  }
  // The cursor moves only now, after every line of the update was imported.
  const { error } = await getAdminSupabase()
    .from('bank_feed_connections')
    .update({ sync_cursor: result.nextCursor })
    .eq('company_id', companyId)
    .eq('id', row.id);
  if (error) mapIntegrationError(error);
  return sum;
}

const bigger = (a: string, b: string): string => {
  try {
    return BigInt(a) > BigInt(b) ? a : b;
  } catch {
    return a > b ? a : b;
  }
};

async function syncSaltEdge(
  companyId: string,
  secrets: Secrets,
  accounts: FeedAccount[],
): Promise<SyncSummary> {
  const row = secrets.row;
  if (row.external_id === null) throw new ConflictError('The bank link is not linked yet.');
  const keys = saltedgeKeys(secrets);
  const sum = empty();
  for (const account of accounts) {
    const list = await saltedge.listTransactions(
      keys,
      row.external_id,
      account.externalId,
      account.cursor ?? '',
    );
    const read = readTransactions(list, readSaltEdgeTransaction);
    sum.accounts += 1;
    sum.lines += read.lines.length;
    sum.leftOut +=
      read.left.pending +
      read.left.currency +
      read.left.invalid +
      read.left.zero +
      read.left.duplicate;
    const done = await importLines(companyId, row.id, account, read.lines);
    sum.imported += done.imported;
    sum.skipped += done.skipped;
    sum.repeats += done.repeats;
    const newest = read.lines.reduce((m, l) => bigger(m, l.externalId), account.cursor ?? '');
    const { error } = await getAdminSupabase()
      .from('bank_feed_accounts')
      .update({
        sync_cursor: newest === '' ? null : newest,
        last_imported_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('id', account.id);
    if (error) mapIntegrationError(error);
  }
  return sum;
}

/**
 * Syncs one link. A problem is written to the link (a login problem asks the owner to log in again) and thrown again, so a person
 * who pressed the button sees it and the job goes on with the next link.
 */
export async function syncConnection(companyId: string, id: string): Promise<SyncSummary> {
  const secrets = await secretsOf(companyId, id);
  if (secrets.row.status !== 'active') throw new ConflictError('The bank link is not active.');
  const accounts = await mappedAccounts(companyId, id);
  const admin = getAdminSupabase();
  let sum = empty();
  try {
    if (accounts.length > 0)
      sum = secrets.plaid
        ? await syncPlaid(companyId, secrets, accounts)
        : await syncSaltEdge(companyId, secrets, accounts);
    const { error } = await admin
      .from('bank_feed_connections')
      .update({ last_synced_at: new Date().toISOString(), last_error: null })
      .eq('company_id', companyId)
      .eq('id', id);
    if (error) mapIntegrationError(error);
    if (sum.imported > 0 || sum.removed > 0)
      await record(companyId, 'bankfeed.synced', 'bank_feed_connection', id, { ...sum });
    return sum;
  } catch (error) {
    if (error instanceof CommerceApiError) {
      if (/ITEM_LOGIN_REQUIRED/.test(error.message) || error.message.includes('InvalidCredentials'))
        await markNeedsReauth(companyId, id, error.message);
      else await markError(companyId, id, error.message);
    } else await markError(companyId, id, 'The sync failed. It will be tried again.');
    throw error;
  }
}

/** The cron job: links whose last sync is older than the interval (or that never synced), one batch per run. */
export async function runDueSyncs(
  now: Date = new Date(),
): Promise<{ synced: number; failed: number }> {
  const before = new Date(now.getTime() - BANKFEED_SYNC_EVERY_HOURS * 3_600_000).toISOString();
  const { data, error } = await getAdminSupabase()
    .from('bank_feed_connections')
    .select('id, company_id')
    .eq('status', 'active')
    .is('deleted_at', null)
    .or(`last_synced_at.is.null,last_synced_at.lt.${before}`)
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(BANKFEED_SYNC_BATCH);
  if (error) throw new InternalError(error);
  let synced = 0;
  let failed = 0;
  for (const c of (data ?? []) as { id: string; company_id: string }[]) {
    try {
      await syncConnection(c.company_id, c.id);
      synced += 1;
    } catch (e) {
      failed += 1;
      log.warn('bank link sync failed', {
        connectionId: c.id,
        error: e instanceof Error ? e.message : 'error',
      });
    }
  }
  return { synced, failed };
}
