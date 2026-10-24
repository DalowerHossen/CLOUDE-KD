// path: services/accounting/register.ts
// Registers the `accounting` contract: other STEPs never call accounting directly; it is fed by domain events.
import { registerService } from '@/lib/container';
import { repost } from './posting';

export default async function register(): Promise<void> {
  registerService('accounting', { repost });
}
