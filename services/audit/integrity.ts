// path: services/audit/integrity.ts
// Periodic integrity run: checkpoint every chain, verify hashes, gaps and checkpoints, and raise a tamper event
// that names the exact sequence number.
import 'server-only';
import { z } from 'zod';
import { tryGetService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { chainKeyFor, verifyChainByKey } from './audit-service';
import { createCheckpoint, verifyCheckpoints } from './checkpoint';

const log = createLogger({ component: 'audit-integrity' });
const chainRows = z.array(
  z.object({ chain_key: z.string(), company_id: z.string().uuid().nullable() }).strip(),
);

export interface IntegrityReport {
  chains: number;
  broken: {
    chainKey: string;
    firstBrokenSequence: string | null;
    gaps: string[];
    badCheckpoints: string[];
  }[];
}

export async function runAuditIntegrity(): Promise<IntegrityReport> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('audit_logs')
    .select('chain_key, company_id')
    .order('chain_key')
    .limit(100_000);
  if (error) throw new InternalError(error);
  const seen = new Map<string, string | null>();
  for (const row of chainRows.parse(data))
    if (!seen.has(row.chain_key)) seen.set(row.chain_key, row.company_id);
  seen.set(chainKeyFor(null), null);

  const report: IntegrityReport = { chains: 0, broken: [] };
  for (const [chainKey, companyId] of seen) {
    report.chains += 1;
    await createCheckpoint(admin, chainKey, companyId);
    const chain = await verifyChainByKey(chainKey, { fromSequence: null, toSequence: null });
    const checkpoints = await verifyCheckpoints(admin, chainKey);
    if (chain.ok && checkpoints.ok) continue;
    const entry = {
      chainKey,
      firstBrokenSequence: chain.firstBrokenSequence,
      gaps: chain.gaps,
      badCheckpoints: checkpoints.failedCheckpointIds,
    };
    report.broken.push(entry);
    log.error('audit chain integrity failure', entry);
    await tryGetService('security')?.raiseSecurityEvent('other', {
      reason: 'audit_chain_broken',
      ...entry,
    });
    await tryGetService('events')?.publish({
      name: 'security.event',
      companyId,
      payload: { reason: 'audit_chain_broken', ...entry },
    });
  }
  return report;
}
