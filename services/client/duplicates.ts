// path: services/client/duplicates.ts
// Duplicate detection for clients: the same e-mail or tax number, or a very similar name.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';

export interface DuplicateCandidate {
  id: string;
  name: string;
  email: string | null;
  reason: 'email' | 'tax_id' | 'name';
  score: number;
}
export interface DuplicatePair {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  reason: 'email' | 'name';
  score: number;
}

export async function findDuplicates(
  companyId: string,
  input: { name: string; email?: string | null; taxId?: string | null; exclude?: string | null },
): Promise<DuplicateCandidate[]> {
  const { data, error } = await getAdminSupabase().rpc('kd_client_duplicates', {
    p_company: companyId,
    p_name: input.name,
    p_email: input.email ?? null,
    p_tax_id: input.taxId ?? null,
    p_exclude: input.exclude ?? null,
  });
  if (error) throw new InternalError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    email: r.email ? String(r.email) : null,
    reason: String(r.reason) as DuplicateCandidate['reason'],
    score: Math.round(Number(r.score) * 100) / 100,
  }));
}

export async function duplicatePairs(companyId: string): Promise<DuplicatePair[]> {
  const { data, error } = await getAdminSupabase().rpc('kd_client_duplicate_pairs', {
    p_company: companyId,
    p_limit: 50,
  });
  if (error) throw new InternalError(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    aId: String(r.a_id),
    aName: String(r.a_name),
    bId: String(r.b_id),
    bName: String(r.b_name),
    reason: String(r.reason) as DuplicatePair['reason'],
    score: Math.round(Number(r.score) * 100) / 100,
  }));
}
