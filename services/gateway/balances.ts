// path: services/gateway/balances.ts
// The balance of a sub-merchant (exact text from the database) and its statement as CSV.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { statementCsv, type Balance } from '@/lib/gateway/split-rules';
import { SETTLEMENT_STATEMENT_ROWS } from '@/config/s16-settlement';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import { getService } from '@/lib/container';
import type { Actor } from '@/types/contracts';
import { need } from './db';
import { listEntries } from './entries';
import { getSubMerchant } from './sub-merchants';

const exact = (value: unknown): string => Money.parseRounded(String(value)).toDbString();

export async function balanceOfSub(companyId: string, subMerchantId: string): Promise<Balance> {
  await getSubMerchant(companyId, subMerchantId);
  const { data, error } = await getAdminSupabase().rpc('kd_settlement_balance', {
    p_company: companyId,
    p_sub: subMerchantId,
    p_now: new Date().toISOString(),
  });
  if (error) throw new InternalError(error);
  const row = ((data ?? []) as Record<string, unknown>[])[0];
  return {
    totalNet: exact(row?.total_net ?? '0'),
    pending: exact(row?.pending ?? '0'),
    paid: exact(row?.paid ?? '0'),
    available: exact(row?.available ?? '0'),
  };
}

/** The statement of a sub-merchant as a CSV file text (the latest entries). The export is audited. */
export async function statementOf(actor: Actor, subMerchantId: string): Promise<string> {
  const companyId = need(actor);
  const rows = await listEntries(companyId, subMerchantId, SETTLEMENT_STATEMENT_ROWS, null);
  await getService('audit').record({
    action: 'settlement.statement_exported',
    resourceType: 'sub_merchant',
    resourceId: subMerchantId,
    companyId,
    metadata: { rows: rows.length, by: actor.userId },
  });
  return statementCsv(rows);
}
