// path: services/mor/register.ts
// The merchant-of-record services are used through their functions (the payment flow asks `settlementGate`); nothing
// is added to the service container by this STEP's settlement part. The default export keeps the registration
// convention so the generated barrel can list this folder.
export default async function register(): Promise<void> {
  // Nothing to register: the `wallet` contract is registered by services/wallet/register.ts.
}
