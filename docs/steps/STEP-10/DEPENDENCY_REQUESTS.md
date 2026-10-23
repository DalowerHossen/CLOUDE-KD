# STEP 10 - Requests to the Integrator

**R1 Contract change (STEP 01 / Integrator): reverse a payment on an invoice.** Add to `types/contracts/invoice.ts` and implement in `services/invoice/` (STEP 09): `reversePayment({ invoiceId, paymentId, refundId, amount }): Promise<{ status: InvoiceStatus }>`, idempotent per `refundId`, lowering `amount_paid` and moving a `paid` invoice back to `partially_paid` or the open state. STEP 10 then calls it from `services/payment/refunds.ts` after a successful refund (today the invoice is not touched, see DECISIONS D7).

**R2 Generator step (`scripts/gen.mjs`).** Generate `components/payment/processors/index.generated.ts` from the folders `components/payment/processors/<id>/index.tsx` (same method as the adapter index): `export const secureFormLoaders: Partial<Record<ProcessorId, SecureFormLoader>> = { stripe: () => import('./stripe'), ... }`. The ids must be known processor ids.

**R3 `proxy.ts` (STEP 04 file).** Pass the payment page origins to the CSP builder: in `buildRequestSecurity({ ... })` add `processorOrigins: paymentPageOrigins()` imported from `@/lib/payment/csp`. Until then the payment profile allows no processor host.

**R4 `package.json` scripts.** Add:

- `"verify:step10": "tsx scripts/verify/step10-core.ts && tsx --conditions=react-server scripts/verify/step10-flow.ts && node scripts/verify/step10-tenant.mjs && node scripts/verify/step10-static.mjs && tsx scripts/verify/step10-readme.ts --check"`.

**R5 Environment.** `CARD_IDENTITY_HMAC_KEY` (fragment `config/env/s10.env.fragment`, schema `lib/env/s10.ts`) must be set in every deployment that takes card payments (`openssl rand -base64 48`). Processor keys are not environment values; the super admin enters them in the dashboard.

**R6 Client portal (STEP 13).** The page `/pay/[token]` renders `<CheckoutPanel token={token} />` (`components/payment/checkout-panel.tsx`) and answers the 3D Secure return address with the same component. Receipts use `receiptData()` from `services/payment/receipt-data.ts` or `GET /api/payments/[id]/receipt`.

**R7 Regenerate after merge.** `npm run gen` (nav, permissions, approval rules, strings, cron schedule, bootstrap, env files are already committed from this branch; run it again after merging with other STEPs).

No npm package is needed by STEP 10.
