// path: lib/middleware/tenant.ts
// Tenant resolution. The tenant id comes only from the verified Auth user (app_metadata is writable by the server only).
// A resource of another tenant is answered with NotFoundError (404), never 403, so ids cannot be probed.
import 'server-only';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/errors';
import type { TenantContext } from '@/types/contracts';

const claimSchema = z
  .object({
    company_id: z.string().uuid(),
    role: z.enum(['owner', 'staff']),
  })
  .strip();

const companyRowSchema = z
  .object({
    id: z.string().uuid(),
    plan_key: z.string().min(1),
    data_region: z.string().min(1),
    status: z.enum(['active', 'suspended', 'closed']),
  })
  .strip();

/** Resolves the tenant of the signed-in user. `client` must be the user-bound server client (RLS applies). */
export async function resolveTenantContext(client: SupabaseClient): Promise<TenantContext> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new UnauthorizedError();
  const claims = claimSchema.safeParse(data.user.app_metadata);
  if (!claims.success) throw new ForbiddenError('This account is not linked to a company.');

  const { data: row, error: rowError } = await client
    .from('companies')
    .select('id, plan_key, data_region, status')
    .eq('id', claims.data.company_id)
    .is('deleted_at', null)
    .maybeSingle();
  if (rowError || !row) throw new NotFoundError();
  const company = companyRowSchema.parse(row);
  if (company.status !== 'active') throw new ForbiddenError('This company is not active.');
  return {
    companyId: company.id,
    planKey: company.plan_key,
    dataRegion: company.data_region,
    status: company.status,
  };
}

/** Throws NotFoundError unless the resource belongs to the given tenant. A null resource tenant is platform data. */
export function assertResourceInTenant(context: TenantContext, resourceCompanyId: string | null): void {
  if (resourceCompanyId === null || resourceCompanyId !== context.companyId) throw new NotFoundError();
}
