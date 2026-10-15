// path: services/audit/checkpoint.ts
// Periodic Merkle checkpoints. Each checkpoint covers the entries after the previous checkpoint of the same chain
// and is signed with Ed25519. Verification recomputes the root from the stored entries and checks the signature.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { InternalError } from '@/lib/errors';
import { merkleRoot } from './merkle';
import { auditKeyId, checkpointMessage, signCheckpoint, verifyCheckpointSignature } from './signing';

const MAX_PER_CHECKPOINT = 5000;

const entrySchema = z.object({ sequence: z.coerce.string(), entry_hash: z.string().length(64) }).strip();
const checkpointSchema = z
  .object({
    id: z.string().uuid(),
    chain_key: z.string(),
    from_sequence: z.coerce.string(),
    to_sequence: z.coerce.string(),
    entry_count: z.number().int(),
    merkle_root: z.string(),
    last_entry_hash: z.string(),
    signature: z.string(),
  })
  .strip();

export interface CheckpointResult {
  created: boolean;
  fromSequence: string | null;
  toSequence: string | null;
}

export async function createCheckpoint(
  admin: SupabaseClient,
  chainKey: string,
  companyId: string | null,
): Promise<CheckpointResult> {
  const last = await admin
    .from('audit_checkpoints')
    .select('to_sequence')
    .eq('chain_key', chainKey)
    .order('to_sequence', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last.error) throw new InternalError(last.error);
  const afterSequence = last.data ? Number(last.data.to_sequence) : 0;

  const rows = await admin
    .from('audit_logs')
    .select('sequence, entry_hash')
    .eq('chain_key', chainKey)
    .gt('sequence', afterSequence)
    .order('sequence', { ascending: true })
    .limit(MAX_PER_CHECKPOINT);
  if (rows.error) throw new InternalError(rows.error);
  const entries = z.array(entrySchema).parse(rows.data);
  if (entries.length === 0) return { created: false, fromSequence: null, toSequence: null };

  const first = entries[0];
  const final = entries[entries.length - 1];
  if (!first || !final) throw new InternalError();
  const root = await merkleRoot(entries.map((e) => e.entry_hash));
  const message = checkpointMessage({
    chainKey,
    fromSequence: first.sequence,
    toSequence: final.sequence,
    merkleRoot: root,
    lastEntryHash: final.entry_hash,
  });
  const insert = await admin.from('audit_checkpoints').insert({
    company_id: companyId,
    chain_key: chainKey,
    from_sequence: Number(first.sequence),
    to_sequence: Number(final.sequence),
    entry_count: entries.length,
    merkle_root: root,
    last_entry_hash: final.entry_hash,
    signature: await signCheckpoint(message),
    key_id: await auditKeyId(),
  });
  if (insert.error) throw new InternalError(insert.error);
  return { created: true, fromSequence: first.sequence, toSequence: final.sequence };
}

export interface CheckpointVerification {
  ok: boolean;
  checked: number;
  failedCheckpointIds: string[];
}

export async function verifyCheckpoints(admin: SupabaseClient, chainKey: string): Promise<CheckpointVerification> {
  const cps = await admin.from('audit_checkpoints').select('*').eq('chain_key', chainKey).order('to_sequence');
  if (cps.error) throw new InternalError(cps.error);
  const failed: string[] = [];
  const list = z.array(checkpointSchema).parse(cps.data);
  for (const cp of list) {
    const rows = await admin
      .from('audit_logs')
      .select('sequence, entry_hash')
      .eq('chain_key', chainKey)
      .gte('sequence', Number(cp.from_sequence))
      .lte('sequence', Number(cp.to_sequence))
      .order('sequence');
    if (rows.error) throw new InternalError(rows.error);
    const entries = z.array(entrySchema).parse(rows.data);
    const last = entries[entries.length - 1];
    const message = checkpointMessage({
      chainKey,
      fromSequence: cp.from_sequence,
      toSequence: cp.to_sequence,
      merkleRoot: cp.merkle_root,
      lastEntryHash: cp.last_entry_hash,
    });
    const rootOk =
      entries.length === cp.entry_count &&
      last?.entry_hash === cp.last_entry_hash &&
      (await merkleRoot(entries.map((e) => e.entry_hash))) === cp.merkle_root;
    if (!rootOk || !(await verifyCheckpointSignature(message, cp.signature))) failed.push(cp.id);
  }
  return { ok: failed.length === 0, checked: list.length, failedCheckpointIds: failed };
}
