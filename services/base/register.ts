// path: services/base/register.ts
// Registers the STEP 02 base services in the container. Extended by later sub-steps (locks, permissions).
import { registerService } from '@/lib/container';
import { createTenantService } from './tenant-service';

export default async function register(): Promise<void> {
  registerService('tenant', createTenantService());
}
