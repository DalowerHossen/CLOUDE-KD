// path: services/auth/register.ts
import { registerService } from '@/lib/container';
import { createAuthService } from './auth-service';

export default async function register(): Promise<void> {
  registerService('auth', createAuthService());
}
