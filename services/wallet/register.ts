// path: services/wallet/register.ts
// Registers the `wallet` contract. Other STEPs reach the ledger only through it.
import { registerService } from '@/lib/container';
import { walletService } from './wallet-service';

export default async function register(): Promise<void> {
  registerService('wallet', walletService);
}
