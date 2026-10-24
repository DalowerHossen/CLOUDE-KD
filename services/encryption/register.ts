// path: services/encryption/register.ts
import { registerService } from '@/lib/container';
import { createEncryptionService } from './encryption-service';

export default async function register(): Promise<void> {
  registerService('encryption', createEncryptionService());
}
