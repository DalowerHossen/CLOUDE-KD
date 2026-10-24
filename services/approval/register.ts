// path: services/approval/register.ts
import { registerService } from '@/lib/container';
import { createApprovalService } from './approval-service';

export default async function register(): Promise<void> {
  registerService('approval', createApprovalService());
}
