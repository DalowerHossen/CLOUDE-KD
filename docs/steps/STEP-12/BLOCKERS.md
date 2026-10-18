# STEP 12 - Blockers

**B1 (sub-step 12.1.d, NMI Collect.js form).** Rule 8 and REQ-DOC forbid writing processor code from memory. The pages of https://docs.nmi.com that were read show `CollectJS.configure({ variant: 'inline', fields: { ccnumber, ccexp, cvv }, callback })` and the token returned, but not how a submission is started (a payment-button option or a method call). The Collect.js reference sits in the Integration Portal on `secure.nmi.com`, which the network policy of this environment refuses.

Done instead: no `collectjs` form is registered, so the checkout shows "unavailable" for NMI; the adapter, the shared server module and the connection test of the `collectjs` mode are complete. To resolve: allow `secure.nmi.com` for this environment (or paste the Collect.js reference), then write `components/payment/processors/nmi/collectjs/` and tick 12.1.d.

**B2 (sub-steps 12.1.b/c, NMI production REST API address).** Only `https://sandbox.nmi.com/api` is stated. The adapter refuses live accounts before any call (`ValidationError`). To resolve: confirm the production address with NMI or the documentation, set it in `apiBase` of `lib/payment/adapters/nmi/shared-server.ts`, add its origins to `PROCESSOR_ORIGINS.nmi`, and run the live checks.
