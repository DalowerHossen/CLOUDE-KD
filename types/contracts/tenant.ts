// path: types/contracts/tenant.ts
import type { TenantContext, Uuid } from './common';

export interface TenantService {
  /** Resolves the tenant from the authenticated session, never from client input. */
  getTenantContext(): Promise<TenantContext>;
  /** Throws NotFoundError when the resource belongs to another tenant (never 403). */
  assertSameTenant(resourceCompanyId: Uuid | null): Promise<void>;
}
