# STEP 11 - Handoff

Payment processor adapters, group 1: Stripe, PayPal, Braintree, Square, Authorize.Net, BlueSnap, Verifone, PayArc. Branch `claude/clever-goldberg-8ncdae`, based on the end of STEP 10; `origin/integration` was not merged into this branch by this chat (Integrator).

## 1. What was built (per processor)
`lib/payment/adapters/<id>.ts` (+ `<id>/{api,mapping,webhook}.ts`), `app/api/webhooks/<id>/route.ts` (POST only), `components/payment/processors/<id>/index.tsx`, `docs/processors/<id>.md` (13 sections) and `<id>.verify.md`, `scripts/verify/step11-<id>.ts`. Shared-file entries: `PROCESSOR_ORIGINS` (`config/processors.ts`), `AUTH_VALIDITY_HOURS_BY_PROCESSOR` (`config/payment-risk.ts`), and the two generated loader files (`npm run gen`). Run any check with `npx tsx --conditions=react-server scripts/verify/step11-<id>.ts`.

## 2. Status table
All documentation was read on 2026-10-17 (UTC) in this session from the processor's own site. "Sandbox" = scenarios of the `.verify.md` run with real sandbox credentials: **none have been run for any processor** (credentials were not provided to this chat); every row lists the local fake-transport checks only.

| Processor | Sandbox access | Local checks | Modes | Auth/capture | 3DS | Partial refund | Webhook verification | Card identity |
|---|---|---|---|---|---|---|---|---|
| Stripe | Dashboard sandbox (keys `sk_test_`, `pk_test_`) | see `stripe.verify.md` | `default` (Payment Element) | yes | yes | yes | `Stripe-Signature` HMAC-SHA256 with tolerance | charge card fingerprint |
| PayPal | developer dashboard sandbox business account + REST app | see `paypal.verify.md` | `default` (Card Fields) | yes | yes | yes | postback `verify-webhook-signature` | `bin|last digits|expiry|brand` |
| Braintree | separate sandbox account | 18 | `hosted_fields` | yes | yes | yes (once settling) | `bt_signature` HMAC-SHA1 (destination check waits for request R1) | `uniqueNumberIdentifier`, else `bin|last4|expiry|brand` |
| Square | Developer Console sandbox | 14 | `web_payments` | yes (full capture only) | no (no result field) | yes | HMAC-SHA256 over URL + body | card fingerprint, else `bin|last4|expiry|brand` |
| Authorize.Net | developer.authorize.net sandbox account | 13 | `accept_hosted` | yes | no | yes (after settlement) | `X-ANET-Signature` HMAC-SHA512 (header form inferred, both forms accepted) | none (null) |
| BlueSnap | sandbox merchant (`sandbox.bluesnap.com`) | 14 | `hosted_fields` | yes | yes | yes | **blocked B1: refuses every delivery** | `bin|last4|brand` |
| Verifone | Verifone Central sandbox + simulator contract (demo account from Verifone) | 27 | `iframe_checkout` | yes (full capture only) | no (needs billing fields, request R4) | yes (after settlement) | `x-vfi-jws` detached JWS against the published key file | token, else `first6|last4|brand` |
| PayArc | merchant sandbox from support@payarc.com | 16 | `hosted_fields` | yes (full capture only) | no | yes (after batching) | **blocked B2: refuses every delivery** | card fingerprint, else `first6|last4|brand|expiry` |

Known limits per processor are in section C of each `.verify.md` and section 12 of each `.md`. In short:
- **Stripe, PayPal:** see their records (3DS handled by the processor's own form; PayPal orders must be authorized within 3 hours).
- **Braintree:** no webhook for authorization results; GET webhook challenge needs request R1; CSP for 3DS challenges needs R2.
- **Square:** no 3DS result, full capture only, refunds start `PENDING`.
- **Authorize.Net:** no idempotency key, no card identity, API hosts not reachable from the build environment.
- **BlueSnap:** server IP must be on the Authorized IPs list; IPN authentication unread (B1).
- **Verifone:** completion message of the iFrame is only partly documented (the server verifies instead); no AVS; the webhook key host must be reachable from the server.
- **PayArc:** webhook cannot be authenticated (B2); production Hosted Fields address unknown, so live checkouts are refused (B3).

## 3. Blockers and requests
- `docs/steps/STEP-11/BLOCKERS.md`: B1 (BlueSnap IPN authentication), B2 (PayArc webhook authentication), B3 (PayArc live script address).
- `docs/steps/STEP-11/DEPENDENCY_REQUESTS.md`: R1 Braintree GET challenge hook, R2 CSP for 3DS challenge frames, R3 the missing `scripts/gen-processor-status.sh`, R4 billing contact for Verifone 3DS. STEP 10's R1 to R7 also apply (generator step, `proxy.ts` CSP origins, scripts, `CARD_IDENTITY_HMAC_KEY`, regenerate after merge).

## 4. Next actions
1. Integrator: merge STEPS 07 to 11 into `integration`; apply requests R1 to R4 of this step and R1 to R7 of STEP 10; set `CARD_IDENTITY_HMAC_KEY`; run `npm run gen`.
2. Super admin: for each processor create a sandbox account (section 2), enter credentials in the admin processors page (never in chat), run the connection test, then run the scenarios in `docs/processors/<id>.verify.md` and record transaction ids; only then enable the processor. Do **not** create BlueSnap IPNs or PayArc webhook endpoints until B1 and B2 are resolved; give BlueSnap fixed outbound IPs.
3. A STEP 11 follow-up chat: with `support.bluesnap.com` reachable (or the page pasted) resolve B1; ask PayArc for B2 and B3; tick 11.6.c and 11.8.c; replace "pending" rows with sandbox results.
