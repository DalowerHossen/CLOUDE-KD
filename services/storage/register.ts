// path: services/storage/register.ts
import { registerService } from '@/lib/container';
import { createStorageService } from './storage-service';

export default async function register(): Promise<void> {
  registerService('storage', createStorageService());
}
