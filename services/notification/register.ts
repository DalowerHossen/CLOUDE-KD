// path: services/notification/register.ts
import { registerService } from '@/lib/container';
import { createNotificationService } from './notification-service';

export default async function register(): Promise<void> {
  registerService('notification', createNotificationService());
}
