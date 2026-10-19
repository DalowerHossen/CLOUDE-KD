// path: services/payout/register.ts
// Payouts are used through their functions by the wallet pages and the payout queue; nothing is added to the service
// container. The default export keeps the registration convention so the generated barrel can list this folder.
export default async function register(): Promise<void> {
  // Nothing to register: the `wallet` contract is registered by services/wallet/register.ts.
}
