// path: services/entitlement/register.ts
// Registers the database-backed `entitlement` contract (it replaces any earlier implementation on purpose).
import { registerService } from '@/lib/container';
import { createEntitlementService } from './entitlement';

export default async function register(): Promise<void> {
  registerService('entitlement', createEntitlementService(), { override: true });
}
