# STEP 11 - Blockers

**B1 (sub-step 11.6.c, BlueSnap webhook authentication).** Rule 8 and REQ-DOC forbid writing processor code from memory or from third-party descriptions. BlueSnap's webhook (IPN) authentication (the headers `bls-signature` and `bls-ipn-timestamp`: what is hashed, the role of the key, the timestamp format) and its source IP addresses are documented on `https://support.bluesnap.com/docs/ipn-setup`, which the network policy of this environment refuses (`support.bluesnap.com`). The pages on `developers.bluesnap.com` that could be read describe the webhook types but not the authentication.

Done instead (fail closed): `lib/payment/adapters/bluesnap/webhook.ts` refuses every delivery and maps every body to `unknown` without a transaction id; the route `app/api/webhooks/bluesnap/route.ts` exists. Do **not** enable IPNs for the platform URL in the BlueSnap Merchant Portal until this is resolved.

To resolve: allow `support.bluesnap.com` for this environment (so the page can be read in a session), or paste the page's authentication section into the session; then implement `verifyBluesnapWebhook` and the event mapping, extend `scripts/verify/step11-bluesnap.ts`, and tick 11.6.c.
