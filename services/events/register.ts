// path: services/events/register.ts
import { registerService } from '@/lib/container';
import { createEventService } from './event-service';

export default async function register(): Promise<void> {
  registerService('events', createEventService());
}
