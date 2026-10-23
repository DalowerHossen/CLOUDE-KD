// path: services/client/register.ts
import './tenant-export';
import { registerService, tryGetService } from '@/lib/container';
import { InternalError, NotFoundError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { ClientService } from '@/types/contracts';

async function load(clientId: string): Promise<Record<string, unknown>> {
  const { data, error } = await getAdminSupabase()
    .from('clients')
    .select('id, company_id, name, email, billing_email, billing_postal_code, billing_country')
    .eq('id', clientId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  // When the call runs for a signed-in company, a client of another company is "not found".
  const tenant = tryGetService('tenant');
  if (tenant) {
    const ctx = await tenant.getTenantContext().catch(() => null);
    if (ctx && ctx.companyId !== String(data.company_id)) throw new NotFoundError();
  }
  return data;
}

function createClientContract(): ClientService {
  return {
    async getById(clientId) {
      const r = await load(clientId);
      return {
        id: String(r.id),
        companyId: String(r.company_id),
        name: String(r.name),
        email: r.email ? String(r.email) : null,
      };
    },
    async getBilling(clientId) {
      const r = await load(clientId);
      return {
        clientId: String(r.id),
        name: String(r.name),
        email: r.billing_email ? String(r.billing_email) : r.email ? String(r.email) : null,
        billingPostalCode: r.billing_postal_code ? String(r.billing_postal_code) : null,
        billingCountry: r.billing_country ? String(r.billing_country) : null,
      };
    },
  };
}

export default async function register(): Promise<void> {
  registerService('clients', createClientContract());
}
