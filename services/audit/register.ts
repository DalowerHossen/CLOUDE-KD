// path: services/audit/register.ts
import { registerService } from '@/lib/container';
import { createAuditService } from './audit-service';

export default async function register(): Promise<void> {
  registerService('audit', createAuditService());
}
