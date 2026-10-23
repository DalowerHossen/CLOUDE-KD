// path: config/boot/s04-security.ts
// Connects the fraud reaction to security events once per process.
import { reactToSecurityEvent } from '@/services/fraud/reaction';
import { onSecurityEvent } from '@/services/security/events';

export async function boot(): Promise<void> {
  onSecurityEvent(reactToSecurityEvent);
}
