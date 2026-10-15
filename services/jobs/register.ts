// path: services/jobs/register.ts
import { registerService } from '@/lib/container';
import { createJobService } from './job-service';

export default async function register(): Promise<void> {
  registerService('jobs', createJobService());
}
