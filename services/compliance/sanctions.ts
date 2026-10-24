// path: services/compliance/sanctions.ts
// Sanctions lists (OFAC and the United Nations Security Council list) kept in the platform database and the screening provider
// that checks the names of a KYC submission against them. A list is published as one complete file, so an import replaces the
// whole list in one database transaction (a much smaller list is refused unless forced). The import takes the normalized entries
// of lib/compliance/rules.ts; reading the official files of both lists is a separate step (see docs/compliance/sanctions.md).
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, ValidationError } from '@/lib/errors';
import { registerScreeningProvider, type ScreeningSubject } from '@/lib/kyc/screening';
import {
  bestMatch,
  nameTokens,
  type SanctionsCandidate,
  type SanctionsHit,
} from '@/lib/compliance/match';
import { toRow, type SanctionsImport } from '@/lib/compliance/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { restrictedCountryCodes } from './countries';

export interface SourceStatus {
  source: 'ofac' | 'un';
  entryCount: number;
  importedAt: string | null;
  note: string;
}

const MAX_HITS_IN_SUMMARY = 5;

export async function sourceStatus(): Promise<SourceStatus[]> {
  const { data, error } = await getAdminSupabase()
    .from('sanctions_sources')
    .select('source, entry_count, imported_at, note')
    .is('deleted_at', null)
    .order('source');
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({
    source: String(r.source) as SourceStatus['source'],
    entryCount: Number(r.entry_count),
    importedAt: r.imported_at ? String(r.imported_at) : null,
    note: String(r.note),
  }));
}

export async function importSanctions(
  actor: Actor,
  input: SanctionsImport,
): Promise<{ imported: number; skipped: number }> {
  const rows = input.entries.map(toRow).filter((r) => r.search_tokens.length > 0);
  const skipped = input.entries.length - rows.length;
  if (rows.length === 0) throw new ValidationError('No entry has a name that can be searched.');
  const { data, error } = await getAdminSupabase().rpc('kd_sanctions_replace', {
    p_source: input.source,
    p_entries: rows,
    p_by: actor.userId,
    p_note: input.note,
    p_force: input.force,
  });
  if (error) {
    if (error.code === '22023') throw new ValidationError(error.message);
    throw new InternalError(error);
  }
  await getService('audit').record({
    action: 'compliance.sanctions_imported',
    resourceType: 'sanctions_source',
    resourceId: null,
    companyId: null,
    metadata: { source: input.source, imported: Number(data), skipped, forced: input.force },
  });
  return { imported: Number(data), skipped };
}

async function candidates(tokens: string[]): Promise<SanctionsCandidate[]> {
  const { data, error } = await getAdminSupabase().rpc('kd_sanctions_candidates', {
    p_tokens: tokens,
    p_limit: 1000,
  });
  if (error) throw new InternalError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    source: String(r.source) as SanctionsCandidate['source'],
    kind: String(r.kind) as SanctionsCandidate['kind'],
    name: String(r.name),
    aliases: Array.isArray(r.aliases) ? (r.aliases as unknown[]).map(String) : [],
    countries: Array.isArray(r.countries) ? (r.countries as unknown[]).map(String) : [],
    programs: String(r.programs ?? ''),
  }));
}

/** Hits of one name against the imported lists, best score first. */
export async function screenName(name: string): Promise<SanctionsHit[]> {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return [];
  const hits: SanctionsHit[] = [];
  for (const entry of await candidates(tokens)) {
    const hit = bestMatch(name, entry);
    if (hit) hits.push(hit);
  }
  return hits.sort((a, b) => b.score - a.score);
}

async function screenSubjects(
  subjects: readonly ScreeningSubject[],
): Promise<{ status: 'clear' | 'hits' | 'error'; summary: string }> {
  const sources = (await sourceStatus()).filter((s) => s.entryCount > 0);
  if (sources.length === 0)
    return {
      status: 'error',
      summary:
        'No sanctions list is imported yet, so the names were not checked. Check them by hand.',
    };
  const restricted = new Set(await restrictedCountryCodes());
  const lines: string[] = [];
  for (const subject of subjects) {
    if (subject.countryCode && restricted.has(subject.countryCode.toUpperCase()))
      lines.push(`${subject.name}: country ${subject.countryCode.toUpperCase()} is restricted.`);
    const hits = await screenName(subject.name);
    for (const hit of hits.slice(0, MAX_HITS_IN_SUMMARY))
      lines.push(
        `${subject.name}: possible match with ${hit.name} (${hit.source.toUpperCase()}, score ${hit.score}).`,
      );
  }
  const covered = sources.map((s) => s.source.toUpperCase()).join(' and ');
  if (lines.length > 0) return { status: 'hits', summary: lines.join(' ') };
  return { status: 'clear', summary: `No match in the imported list(s): ${covered}.` };
}

/** Called once by the KYC review before it screens. Registering twice changes nothing. */
export function ensureSanctionsProvider(): void {
  registerScreeningProvider({ id: 'sanctions-lists', screen: screenSubjects });
}
