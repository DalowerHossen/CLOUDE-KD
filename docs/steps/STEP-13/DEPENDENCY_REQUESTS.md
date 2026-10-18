# STEP 13 - Requests to the Integrator

**R1 Token identity for expired and revoked links (`types/contracts/tokens.ts`, `services/security/token-service.ts`).** `TokenVerification` for `expired` and `revoked` carries only the reason. Please add `id`, `docType`, `docId` and `companyId` to those two cases so the portal can offer a re-request without its own lookup. Until then STEP 13 uses `kd_portal_token_lookup` (decision D3).

**R2 Public payment link for the portal (`services/payment/links.ts`).** The invoice page's "Pay now" creates a link with a fixed portal actor (decision D8). Please add `createClientPaymentLink({ companyId, invoiceId, validHours })` that needs no actor, so STEP 13 can use it.
