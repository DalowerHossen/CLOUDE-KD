// path: services/kyc/register.ts
import { registerService } from '@/lib/container';
import { createKycService } from './status';

export default async function register(): Promise<void> {
  registerService('kyc', createKycService());
}
