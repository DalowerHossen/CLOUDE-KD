# STEP 11 - Blockers

**B1 (sub-step 11.6.c, BlueSnap webhook authentication).** Rule 8 and REQ-DOC forbid writing processor code from memory or from third-party descriptions. BlueSnap's webhook (IPN) authentication (the headers `bls-signature` and `bls-ipn-timestamp`: what is hashed, the role of the key, the timestamp format) and its source IP addresses are documented on `https://support.bluesnap.com/docs/ipn-setup`, which the network policy of this environment refuses (`support.bluesnap.com`). The pages on `developers.bluesnap.com` that could be read describe the webhook types but not the authentication.

Done instead (fail closed): `lib/payment/adapters/bluesnap/webhook.ts` refuses every delivery and maps every body to `unknown` without a transaction id; the route `app/api/webhooks/bluesnap/route.ts` exists. Do **not** enable IPNs for the platform URL in the BlueSnap Merchant Portal until this is resolved.

To resolve: allow `support.bluesnap.com` for this environment (so the page can be read in a session), or paste the page's authentication section into the session; then implement `verifyBluesnapWebhook` and the event mapping, extend `scripts/verify/step11-bluesnap.ts`, and tick 11.6.c.

**B2 (sub-step 11.8.c, PayArc webhook authentication).** The PayArc documentation (https://docs.payarc.net, "WebHooks", "Add Webhooks") describes the event names and bodies but states no way to check that a delivery came from PayArc: no signature header, no shared secret, no source addresses, no timestamp. Rule 8 forbids inventing one.

Done instead (fail closed): `lib/payment/adapters/payarc/webhook.ts` refuses every delivery and maps every body to `unknown` without a transaction id; the route `app/api/webhooks/payarc/route.ts` exists. Do **not** add the platform URL as a webhook endpoint in the PayArc dashboard until this is resolved. Payments are confirmed without it (the server reads the charge back).

To resolve: ask PayArc support how deliveries are authenticated (or find the page), then implement `verifyPayarcWebhook` and extend `scripts/verify/step11-payarc.ts`.

**B3 (sub-step 11.8.b/d, PayArc live Hosted Fields script address).** The documentation gives only the sandbox script `https://testportal.payarc.net/js/iframeprocess.js`; the production address is not stated. The adapter therefore refuses to create a checkout session for a live account (`ValidationError`), and the secure form accepts only the sandbox address.

To resolve: confirm the production script address with PayArc (or the documentation), add it to `PAYARC_SCRIPT_URLS` in `lib/payment/adapters/payarc/api.ts` and to the allowed set in `components/payment/processors/payarc/index.tsx`, add its origin to `PROCESSOR_ORIGINS.payarc`, and run the live checks.
