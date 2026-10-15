// path: services/compliance/register.ts
import { registerService } from '@/lib/container';
import { createConsentService } from './consent-service';

export default async function register(): Promise<void> {
  registerService('consent', createConsentService());
}
