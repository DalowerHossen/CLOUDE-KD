// path: services/accounting/audit-pack.ts
// The audit support pack for an external auditor: the chart and its change history, the journal entries and lines of a period with
// who made, posted and reversed them, the fiscal periods with their close and reopen facts, the attachments' names, the audit trail
// rows of the company for the period (hash chained) and the result of the chain check. The file is a gzip of JSON with a manifest
// of checksums; a record of each pack is kept. Only an owner with a fresh identity check can make one, and making one is audited.
import 'server-only';
import { gzipSync } from 'node:zlib';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { verifyChainByKey, chainKeyFor } from '@/services/audit/audit-service';
import { listAccounts } from './accounts';
import {
  MAX_PACK_ROWS,
  manifestOf,
  packInput,
  sectionOf,
  sha256Hex,
  type ChainFacts,
  type Manifest,
} from './audit-pack-rules';

type Row = Record<string, unknown>;

/** Reads every page of a query (1000 rows at a time) up to the pack limit; more than that asks for a shorter period. */
async function all(
  label: string,
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new InternalError(error);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < 1000) return out;
    if (out.length > MAX_PACK_ROWS)
      throw new ValidationError(
        `There are too many ${label} for one pack. Choose a shorter period.`,
      );
  }
}

export interface PackResult {
  fileName: string;
  bytes: Uint8Array;
  manifestSha256: string;
  fileSha256: string;
  chainOk: boolean;
}

export async function buildAuditPack(actor: Actor, input: unknown): Promise<PackResult> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = packInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Check the period.');
  const { from, to } = parsed.data;
  const admin = getAdminSupabase();
  const dayAfter = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString();
  const [company, accounts] = await Promise.all([
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
    listAccounts(companyId),
  ]);
  const history = await all('chart changes', (a, b) =>
    admin
      .from('account_history')
      .select('account_id, change, before, after, actor_id, created_at')
      .eq('company_id', companyId)
      .gte('created_at', `${from}T00:00:00Z`)
      .lt('created_at', dayAfter)
      .order('created_at')
      .range(a, b),
  );
  const entries = await all('journal entries', (a, b) =>
    admin
      .from('journal_entries')
      .select(
        'id, entry_number, entry_date, memo, status, source, entry_kind, source_type, source_id, content_hash, total_amount, reverses_entry_id, reversed_by_id, reverse_reason, created_by, posted_by, posted_at, created_at, deleted_at',
      )
      .eq('company_id', companyId)
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date')
      .order('id')
      .range(a, b),
  );
  const ids = entries.map((e) => String(e.id));
  const lines: Row[] = [];
  const attachments: Row[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    lines.push(
      ...(await all('journal lines', (a, b) =>
        admin
          .from('journal_lines')
          .select('entry_id, line_no, account_id, debit, credit, description')
          .eq('company_id', companyId)
          .in('entry_id', chunk)
          .order('entry_id')
          .order('line_no')
          .range(a, b),
      )),
    );
    attachments.push(
      ...(await all('attachments', (a, b) =>
        admin
          .from('journal_attachments')
          .select('entry_id, file_id, name, created_by, created_at')
          .eq('company_id', companyId)
          .in('entry_id', chunk)
          .is('deleted_at', null)
          .order('created_at')
          .range(a, b),
      )),
    );
  }
  const periods = await all('periods', (a, b) =>
    admin
      .from('fiscal_periods')
      .select(
        'name, start_date, end_date, status, ar_closed, ap_closed, closed_at, closed_by, signoff_note, reopen_count, reopen_reason',
      )
      .eq('company_id', companyId)
      .lte('start_date', to)
      .gte('end_date', from)
      .order('start_date')
      .range(a, b),
  );
  const trail = await all('audit trail rows', (a, b) =>
    admin
      .from('audit_logs')
      .select(
        'sequence, created_at, actor_user_id, actor_role, impersonated_by, action, resource_type, resource_id, ip_masked, correlation_id, metadata, prev_hash, entry_hash',
      )
      .eq('company_id', companyId)
      .gte('created_at', `${from}T00:00:00Z`)
      .lt('created_at', dayAfter)
      .order('sequence')
      .range(a, b),
  );
  const chain = await verifyChainByKey(chainKeyFor(companyId), {
    fromSequence: null,
    toSequence: null,
  });
  const head = await admin
    .from('audit_logs')
    .select('sequence, entry_hash')
    .eq('chain_key', chainKeyFor(companyId))
    .order('sequence', { ascending: false })
    .limit(1);
  if (head.error) throw new InternalError(head.error);
  const chainFacts: ChainFacts = {
    ok: chain.ok,
    checkedFrom: chain.checkedFrom,
    checkedTo: chain.checkedTo,
    firstBrokenSequence: chain.firstBrokenSequence,
    gaps: chain.gaps,
    headSequence: head.data?.[0] ? String(head.data[0].sequence) : null,
    headHash: head.data?.[0] ? String(head.data[0].entry_hash) : null,
  };
  const chart = accounts.map((a) => ({
    code: a.code,
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    contra: a.isContra,
    status: a.status,
    id: a.id,
  }));
  const built = [
    sectionOf('chart_of_accounts', chart),
    sectionOf('chart_changes', history),
    sectionOf('journal_entries', entries),
    sectionOf('journal_lines', lines),
    sectionOf('attachments', attachments),
    sectionOf('fiscal_periods', periods),
    sectionOf('audit_trail', trail),
  ];
  const manifest: Manifest = {
    version: 1,
    companyId,
    companyName: String(company.data?.name ?? ''),
    period: { from, to },
    generatedAt: new Date().toISOString(),
    generatedBy: actor.userId,
    sections: built.map((b) => b.section),
    chain: chainFacts,
    notes: [
      'Each section is a list of rows; the checksum is SHA-256 of the JSON text of the rows.',
      'The audit trail rows are hash chained; the chain check ran over the whole chain of the company when the pack was made.',
      'The files attached to journal entries are listed by name and file id and are not inside the pack.',
    ],
  };
  const m = manifestOf(manifest);
  const sections = Object.fromEntries(
    built.map((b) => [b.section.name, JSON.parse(b.json) as unknown[]]),
  );
  const bytes = new Uint8Array(
    gzipSync(
      Buffer.from(
        JSON.stringify({ manifest: JSON.parse(m.json), manifestSha256: m.sha256, sections }),
        'utf8',
      ),
    ),
  );
  const fileSha256 = sha256Hex(bytes);
  const rec = await admin.from('audit_packs').insert({
    company_id: companyId,
    period_from: from,
    period_to: to,
    manifest_sha256: m.sha256,
    file_sha256: fileSha256,
    chain_ok: chain.ok,
    chain_checked_to: chain.checkedTo,
    entries: entries.length,
    audit_rows: trail.length,
    size_bytes: bytes.length,
    created_by: actor.userId,
  });
  if (rec.error) throw new InternalError(rec.error);
  await getService('audit').record({
    action: 'accounting.audit_pack_made',
    resourceType: 'audit_pack',
    resourceId: null,
    companyId,
    metadata: { from, to, manifestSha256: m.sha256, chainOk: chain.ok, entries: entries.length },
  });
  return {
    fileName: `audit-pack-${from}-${to}.json.gz`,
    bytes,
    manifestSha256: m.sha256,
    fileSha256,
    chainOk: chain.ok,
  };
}

export interface PackRecord {
  id: string;
  from: string;
  to: string;
  manifestSha256: string;
  fileSha256: string;
  chainOk: boolean;
  entries: number;
  auditRows: number;
  sizeBytes: number;
  createdAt: string;
}

export async function listPacks(companyId: string): Promise<PackRecord[]> {
  const { data, error } = await getAdminSupabase()
    .from('audit_packs')
    .select(
      'id, period_from, period_to, manifest_sha256, file_sha256, chain_ok, entries, audit_rows, size_bytes, created_at',
    )
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    from: String(r.period_from),
    to: String(r.period_to),
    manifestSha256: String(r.manifest_sha256),
    fileSha256: String(r.file_sha256),
    chainOk: r.chain_ok === true,
    entries: Number(r.entries),
    auditRows: Number(r.audit_rows),
    sizeBytes: Number(r.size_bytes),
    createdAt: String(r.created_at),
  }));
}
