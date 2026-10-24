// path: services/email/register.ts
import { registerService } from '@/lib/container';
import { createEmailService } from './email-service';

export default async function register(): Promise<void> {
  registerService('email', createEmailService());
}
