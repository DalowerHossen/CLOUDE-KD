# STEP 16 - Handoff

Integrations and automation. Branch `claude/clever-goldberg-8ncdae`. Sub-steps 16.1.a, 16.1.b, 16.2, 16.3.a, 16.3.b, 16.4.a, 16.4.a2, 16.4.b, 16.5, 16.6, 16.7, 16.8, 16.9, 16.10 and 16.11 are done. **Not done:** nothing of the plan is left; the open points are B7 (invoice drafts and credit notes, request R1) and R8 (DELETE for Salt Edge). 16.5 stops at "client ready": invoice drafts and credit notes wait for request R1 (BLOCKERS B7).

## What the Integrator must do

1. Run `npm run gen` (nav, permissions, approval rules, cron list, strings index are generated from the fragments of this STEP) and `bash scripts/db-apply.sh --clean`.
2. Answer the dependency requests in `DEPENDENCY_REQUESTS.md`. The ones that change behaviour now: **R6** (one line in `emails/catalog.ts` for `integrationEmailTemplates`; without it the e-mail channel of messaging records a failed attempt), **R1** (write contracts for clients, invoices, products, estimates and payments; until then live API keys cannot write and the wizard cannot import invoices or payments), **R7** (confirm or replace the direct calls of the migration wizard into STEP 08, one file), **R2** (the direct OCR call into `applyOcrResult`, one file), **R5** (content events for social rules), R3, R4.
3. Review the direct cross-STEP calls, each in a single file: `services/ocr/ports.ts` (STEP 15 `applyOcrResult`), `services/migration/ports.ts` (STEP 08 import targets and deletes), and the reads of other STEPs' tables in `services/publicapi/resources.ts`, `services/whatsapp/*` (clients, invoices, payments, read only), `services/messaging/*` (clients, read only), `services/integration/automation.ts` (read only).

## Sub-steps and features

| Sub-step                                                                                                       | Feature list                                  | State                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 16.1.a, 16.1.b Public API v1, keys, sandbox, OpenAPI, developer portal                                         | D (2100-2150 range of the plan)               | built; live writes blocked by R1 (sandbox keys write)                                                                         |
| 16.2 Outgoing webhooks                                                                                         | D (webhook part), Part 9 I                    | built                                                                                                                         |
| 16.3.a, 16.3.b WhatsApp                                                                                        | A                                             | built (sandbox mode until the owner goes live; Meta hosts unreachable here)                                                   |
| 16.4.a, 16.4.a2, 16.4.b Social media (Facebook, Instagram, Threads, LinkedIn, X, Telegram, Pinterest, sandbox) | B, C                                          | built (LinkedIn, X, Telegram, Pinterest send text and a link; Telegram and Pinterest also images; no insights for these four) |
| 16.5 Shopify and WooCommerce                                                                                   | Part 3 J (1091-1115)                          | built up to the client; invoice draft, credit note, product and status sync not built (B7, D14)                               |
| 16.6 Zapier, Make, browser extension                                                                           | E (2181-2202)                                 | endpoints and extension source built; app packages, OAuth sign-in, store publishing not built                                 |
| 16.7 Bank feed                                                                                                 | F1, F2 (2216-2224, 2226); F3 stays in STEP 15 | built (Plaid, Salt Edge); matching, accept and report are STEP 15's (D16)                                                     |
| 16.8 Receipt OCR                                                                                               | G                                             | built (Google Cloud Vision)                                                                                                   |
| 16.9 Multi-channel messaging                                                                                   | I                                             | built for e-mail and WhatsApp; SMS, Telegram, Viber not built                                                                 |
| 16.10 Migration wizard                                                                                         | K                                             | clients, products, suppliers; invoices, payments, opening balances of accounts, OFX not built                                 |
| 16.11 Cron jobs and closure                                                                                    | Part 10 B                                     | built, except the bank feed job (its sub-step is open)                                                                        |

Each DECISIONS entry (D1 to D16) lists what is not built inside its sub-step.

## Migrations (block `S16_*`, each with `_down`)

S16_001 api_keys, S16_002 webhooks_out, S16_003 whatsapp, S16_004 whatsapp_automation, S16_005 social, S16_006 social_schedule, S16_009 ocr, S16_010 messaging, S16_011 migration, S16_012 housekeeping, S16_013 social_networks, S16_014 commerce, S16_015 bankfeed. S16_007 and S16_008 are unused (the numbers moved on; the commerce tables are S16_014 and the bank feed tables S16_015). SQL assertions: `sql/assertions/s16_*.sql` (one per migration).

## Endpoints

`/api/public/v1` (20 routes)

- `/api/public/v1/automation/actions/record-payment-note [POST]`
- `/api/public/v1/automation/hooks [POST]`
- `/api/public/v1/automation/hooks/[id] [DELETE]`
- `/api/public/v1/automation/summary [GET]`
- `/api/public/v1/automation/triggers/client-created [GET]`
- `/api/public/v1/automation/triggers/estimate-approved [GET]`
- `/api/public/v1/automation/triggers/invoice-paid [GET]`
- `/api/public/v1/automation/triggers/payment-received [GET]`
- `/api/public/v1/clients [GET,POST]`
- `/api/public/v1/clients/[id] [GET,PATCH]`
- `/api/public/v1/estimates [GET,POST]`
- `/api/public/v1/estimates/[id] [GET]`
- `/api/public/v1/invoices [GET,POST]`
- `/api/public/v1/invoices/[id] [GET]`
- `/api/public/v1/openapi.json [GET]`
- `/api/public/v1/payments [GET]`
- `/api/public/v1/payments/[id] [GET]`
- `/api/public/v1/products [GET,POST]`
- `/api/public/v1/products/[id] [GET,PATCH]`
- `/api/public/v1/status [GET]`

`/api/integrations` (27 routes)

- `/api/integrations/keys [GET,POST]`
- `/api/integrations/keys/[id] [GET,PATCH,DELETE]`
- `/api/integrations/keys/[id]/rotate [POST]`
- `/api/integrations/keys/[id]/usage [GET]`
- `/api/integrations/messaging/campaigns [GET,POST]`
- `/api/integrations/messaging/campaigns/[id] [GET]`
- `/api/integrations/messaging/campaigns/[id]/cancel [POST]`
- `/api/integrations/messaging/campaigns/[id]/start [POST]`
- `/api/integrations/messaging/campaigns/preview [POST]`
- `/api/integrations/messaging/clients/[id]/prefs [GET,PUT]`
- `/api/integrations/messaging/messages [GET,POST]`
- `/api/integrations/messaging/messages/[id]/retry [POST]`
- `/api/integrations/messaging/reports [GET]`
- `/api/integrations/messaging/routes [GET,PUT]`
- `/api/integrations/messaging/routes/[id] [DELETE]`
- `/api/integrations/messaging/settings [GET,PUT]`
- `/api/integrations/ocr/jobs [GET,POST]`
- `/api/integrations/ocr/jobs/[id]/correct [PATCH]`
- `/api/integrations/ocr/jobs/[id]/retry [POST]`
- `/api/integrations/ocr/settings [GET,PUT]`
- `/api/integrations/webhooks [GET,POST]`
- `/api/integrations/webhooks/[id] [GET,PATCH,DELETE]`
- `/api/integrations/webhooks/[id]/deliveries [GET]`
- `/api/integrations/webhooks/[id]/ping [POST]`
- `/api/integrations/webhooks/[id]/rotate-secret [POST]`
- `/api/integrations/webhooks/deliveries/[deliveryId] [GET]`
- `/api/integrations/webhooks/deliveries/[deliveryId]/replay [POST]`

`/api/whatsapp` (21 routes)

- `/api/whatsapp/account [GET,POST,PATCH]`
- `/api/whatsapp/account/health [POST]`
- `/api/whatsapp/account/verify-token [POST]`
- `/api/whatsapp/campaigns [GET,POST]`
- `/api/whatsapp/campaigns/[id] [GET]`
- `/api/whatsapp/campaigns/[id]/cancel [POST]`
- `/api/whatsapp/campaigns/[id]/pause [POST]`
- `/api/whatsapp/campaigns/[id]/retry [POST]`
- `/api/whatsapp/campaigns/[id]/start [POST]`
- `/api/whatsapp/campaigns/preview [POST]`
- `/api/whatsapp/contacts [GET]`
- `/api/whatsapp/contacts/opt [POST]`
- `/api/whatsapp/messages [GET]`
- `/api/whatsapp/messages/template [POST]`
- `/api/whatsapp/messages/text [POST]`
- `/api/whatsapp/rules [GET,POST]`
- `/api/whatsapp/rules/[id] [PATCH,DELETE]`
- `/api/whatsapp/rules/runs [GET]`
- `/api/whatsapp/templates [GET,POST]`
- `/api/whatsapp/templates/[id] [GET,DELETE]`
- `/api/whatsapp/templates/sync [POST]`

`/api/webhooks/whatsapp` (1 routes)

- `/api/webhooks/whatsapp/[key] [GET,POST]`

`/api/social` (26 routes)

- `/api/social/accounts [GET,POST]`
- `/api/social/accounts/[id] [GET,PATCH,DELETE]`
- `/api/social/accounts/[id]/check [POST]`
- `/api/social/analytics [GET]`
- `/api/social/approvals [GET]`
- `/api/social/evergreen/items [GET,POST]`
- `/api/social/evergreen/items/[id] [PATCH,DELETE]`
- `/api/social/evergreen/plans [GET,PUT]`
- `/api/social/hashtags [GET,POST]`
- `/api/social/hashtags/[id] [DELETE]`
- `/api/social/l/[code] [GET]`
- `/api/social/posts [GET,POST]`
- `/api/social/posts/[id] [GET,PATCH]`
- `/api/social/posts/[id]/cancel [POST]`
- `/api/social/posts/[id]/check [GET]`
- `/api/social/posts/[id]/decide [POST]`
- `/api/social/posts/[id]/history [GET]`
- `/api/social/posts/[id]/publish [POST]`
- `/api/social/posts/[id]/submit [POST]`
- `/api/social/rules [GET,POST]`
- `/api/social/rules/[id] [PATCH,DELETE]`
- `/api/social/rules/fire [POST]`
- `/api/social/rules/runs [GET]`
- `/api/social/schedules [GET,POST]`
- `/api/social/schedules/[id] [PATCH,DELETE]`
- `/api/social/settings [GET,PUT]`

`/api/migration` (7 routes)

- `/api/migration/jobs [GET,POST]`
- `/api/migration/jobs/[id] [GET]`
- `/api/migration/jobs/[id]/cancel [POST]`
- `/api/migration/jobs/[id]/rollback [POST]`
- `/api/migration/jobs/[id]/rows [GET]`
- `/api/migration/jobs/[id]/start [POST]`
- `/api/migration/jobs/[id]/validate [POST]`
- `/api/integrations/commerce/connections [GET, POST]`
- `/api/integrations/commerce/connections/[id] [GET, PATCH, DELETE]`
- `/api/integrations/commerce/connections/[id]/check [POST]`
- `/api/integrations/commerce/connections/[id]/webhooks [POST]`
- `/api/integrations/commerce/connections/[id]/mappings [GET, PUT]`
- `/api/integrations/commerce/connections/[id]/mappings/[mappingId] [DELETE]`
- `/api/integrations/commerce/orders [GET]`
- `/api/integrations/commerce/orders/[id]/retry [POST]`
- `/api/integrations/commerce/orders/[id]/ignore [POST]`
- `/api/integrations/commerce/conflicts [GET]`
- `/api/integrations/commerce/conflicts/[id] [POST]`
- `/api/integrations/commerce/log [GET]`
- `/api/webhooks/shopify [POST]` and `/api/webhooks/woocommerce [POST]` (signed by the store, key in the query)
- `/api/integrations/bank/connections [GET, POST]`
- `/api/integrations/bank/connections/[id] [GET, PATCH, DELETE]`
- `/api/integrations/bank/connections/[id]/link [POST]`, `/finish [POST]`, `/sync [POST]`
- `/api/integrations/bank/connections/[id]/accounts [GET]` and `/accounts/[accountId] [PUT]`
- `/api/webhooks/plaid [POST]` and `/api/webhooks/saltedge [POST]` (signed by the service, key in the query)

The public API document is served at `/api/public/v1/openapi.json`; it is built from `lib/integrations/public-registry.ts`.

## API key scopes

`read:clients`, `read:products`, `read:invoices`, `read:payments`, `read:estimates`, `read:webhooks`, `write:clients`, `write:products`, `write:invoices`, `write:estimates`, `write:webhooks` (payments are read only; a write scope also allows the read of the same resource). A key is `live` or `sandbox`; a sandbox key works on its own table `api_sandbox_records` only. Keys are shown once and stored as SHA-256 hashes.

## Permissions (owner by default)

`integrations.apikey.read|manage`, `integrations.webhook.read|manage`, `integrations.ocr.read|manage`, `integrations.messaging.read|manage`, `migration.read|manage`, `social.read|manage|post|approve`, `commerce.read|sync|manage`, `bankfeed.read|sync|manage`, `whatsapp.read|manage|send|contacts.manage|campaigns.manage`. Actions that need a fresh identity check: creating or rotating a key, changing an account or the OCR settings, starting a campaign (WhatsApp and messaging), starting or rolling back an import, changing a social rule.

## Approval rule

`social.post.publish` (level L1, 24 hours) in `config/approval/s16-social.ts`.

## Event types

Outgoing webhooks (`WEBHOOK_EVENTS` in `config/s16-api.ts`, signed `X-KD-Signature`): invoice.created, sent, viewed, paid, partially_paid, voided, overdue; estimate.sent, approved, rejected; payment.authorized, captured, failed, pending_review, voided, refunded; dispute.opened, evidence_submitted, won, lost; payout.requested, approved, paid, failed; client.created, updated; subscription.created, renewed, cancelled. Domain events consumed by workers (`workers/integrations/`): the same list by `webhookout.fan-out`, and invoice.sent, paid, overdue, payment.captured, failed, refunded, client.created by `whatsapp.rules`. This STEP publishes no domain events of its own. Audit actions are written for every mutation (`social.*`, `whatsapp.*`, `webhook_endpoint.*`, `public_api.*`, `ocr.*`, `messaging.*`, `migration.*`, `api_key.*`).

## Provider documentation (read in this STEP)

- WhatsApp Cloud API v26.0, Facebook Pages, Instagram and Threads publishing and Threads insights: read 2026-10-23 with `curl` from developers.facebook.com (`docs/integrations/whatsapp.md`, `docs/integrations/social.md`).
- Google Cloud Vision: the official API description (discovery document revision 20260918), read 2026-10-23; the guides could not be reached (`docs/integrations/google-vision.md`).
- LinkedIn, X, Telegram and Pinterest posting: read 2026-10-23 with `curl` (`docs/integrations/social-more.md`). Shopify Admin GraphQL 2026-10 and webhooks, WooCommerce REST API v3 and webhooks: read 2026-10-23 with `curl` (`docs/integrations/shopify.md`, `woocommerce.md`). Plaid and Salt Edge: read 2026-10-23 with `curl` (`docs/integrations/plaid.md`, `saltedge.md`).
- Not read: Facebook and Instagram insights (not requested), Zapier, Make, Twilio and the export formats of the invoicing tools (presets are marked as a first guess).

## Environment keys

None are new. Company-specific secrets (WhatsApp token and app secret, social access tokens, the Google API key) are entered in the app and stored encrypted with the encryption contract (purpose `oauth-tokens`, scoped to the company). The site address comes from the existing `NEXT_PUBLIC_APP_URL` (tracked links, extension build).

## Cron jobs (`cron/jobs/s16-*.ts`, all in the generated list)

| Job                       | Schedule         | Work                                                               |
| ------------------------- | ---------------- | ------------------------------------------------------------------ |
| webhook-deliveries        | every minute     | sends due outgoing webhook deliveries and retries                  |
| whatsapp-automation       | every minute     | sends due rule runs and campaign batches                           |
| whatsapp-due-soon         | daily 08:17      | queues due-date rule runs                                          |
| social-publish            | every minute     | publishes due posts, finishes waiting containers                   |
| social-quarter-hour       | every 15 minutes | auto-approves unanswered posts, evergreen queue                    |
| social-hourly             | hourly           | makes posts for schedules, reads Threads insights                  |
| ocr-jobs                  | every minute     | queues receipts, reads a batch                                     |
| messaging                 | every minute     | sends due messages, engagement, A/B winners                        |
| migration-jobs            | every minute     | import and rollback batches                                        |
| commerce-orders           | every minute     | handles due store orders (hourly and daily stores, retries)        |
| integrations-housekeeping | daily 03:43      | key expiry notices, old counters, idle imports, old store sync log |

Every job is safe to run twice (claims by database function, unique keys, or a state check).

## Contracts used

approval, audit, consent, email, encryption, idempotency, notification, permissions, security, storage (all through `lib/container.ts`). Contracts provided: none.

## Navigation and strings

Nav items `developers`, `whatsapp`, `social`, `automation`, `ocr`, `messaging`, `migration`, `commerce`, `bankfeed` in `config/nav/s16.ts`. Strings namespaces `s16Developers`, `s16Whatsapp`, `s16Social`, `s16Automation`, `s16Ocr`, `s16Messaging`, `s16Migration`, `s16Commerce`, `s16Bankfeed`.

## Known issues

- Nothing was sent to or received from any provider: the Meta Graph host, Google Vision and all other providers could not be called from this environment. Every adapter was tested with a fake fetch built from the documented request and response shapes.
- The services, cron jobs, routes and pages were type-checked and linted, and their rules tested as pure functions and SQL assertions, but no end-to-end run against a running app and database was possible (see each section of `VERIFY.md` for what was not run).
- Live writes through the public API, the import of invoices and payments, and the invoice drafts and credit notes of store orders wait for R1 (B1, B7). Salt Edge connections cannot be removed at Salt Edge by the platform until R8 is answered, and the sign of Salt Edge amounts is an assumption to check with a test connection.
- A crash between making a record and writing its row can leave one imported record without a row (skip mode finds it as a duplicate on the next try).
- The presets of the migration wizard and the Instagram daily limit (50 or 100) are best guesses, marked as such.

## 16.12 Sub-merchant gateway (owner request, 2026-10-24)

Migration `S16_019_gateway` (+ `_down`): `gateway_upstreams`, `gateway_routes`, `sub_merchants`, `sub_merchant_keys`, `gateway_calls` (append-only), `gateway_key_windows`, function `kd_gateway_hit`. Entry: `ALL /api/gateway/v1/[...path]` (key in `Authorization: Bearer`, exempt from the browser CSRF and bot checks like `/api/public/`; `lib/middleware/csrf.ts` and `bot-detector.ts` list `/api/gateway/`). Management: `/api/integrations/gateway/{upstream,upstream/secret,routes,routes/[id],sub-merchants,sub-merchants/[id],sub-merchants/[id]/keys,keys/[id],calls}`. Page `(dashboard)/integrations/gateway`. Permissions `gateway.read`, `gateway.manage` (owner; fresh identity check for the secret, the address and keys). Strings `s16Gateway`. The guarded outbound request (`lib/security/ssrf.ts`) now also sends PUT, PATCH and DELETE and sets `Content-Length`. Design: D22. How both sides use it: `docs/integrations/gateway.md`. Not built: sub-merchant KYC, settlement between main merchant and sub-merchants, per-route plans, call-log retention.

## 16.13 Sub-merchant KYC (owner request, 2026-10-24)

Migration `S16_020_sub_merchant_kyc` (+ `_down`): `sub_merchant_kyc`, `sub_merchant_kyc_documents`, `sub_merchant_kyc_links`, `sub_merchants.kyc_approved_until`, `gateway_upstreams.kyc_required`. Applicant routes (secure link in the address, `withApi` public scope, KYC network policy): `GET/POST/PUT/PATCH /api/gateway-kyc/[token]`, `PUT /api/gateway-kyc/[token]/business`; page `(client-portal)/skyc/[token]` (reuses `KycPanel` with an `endpoint` property). Owner routes: `POST /api/integrations/gateway/sub-merchants/[id]/kyc-link`, `GET /api/integrations/gateway/kyc`, `GET .../kyc/[id]`, `POST .../kyc/[id]/action`, `GET .../kyc/[id]/document/[docId]`; pages `(dashboard)/integrations/gateway/kyc` and `.../kyc/[id]`. Permission `gateway.kyc.review` (owner). The screening uses `services/compliance/sanctions.ts` (see `docs/compliance/sanctions.md`; the lists must be imported). `services/kyc/owner.ts` exports `checkImage`. Robots: `/skyc/` is disallowed. Design: D23. Guide: `docs/integrations/gateway-kyc.md`. Not built: platform review of a sub-merchant's case, re-screening when a list changes, monitoring of sub-merchant volume, e-mail of the link.

## 16.14 Sub-merchant settlement ledger (owner request, 2026-10-24)

Migration `S16_021_settlement` (+ `_down`): `settlement_terms`, `settlement_entries` (append-only), `settlement_payouts`, functions `kd_settlement_balance`, `kd_settlement_record_payout`, `kd_settlement_entries_text` (service role only). Routes: `/api/integrations/settlement/{terms,terms/[id],entries,balance,payouts,payouts/[id],statement}`. Page `(dashboard)/integrations/settlement`. Permissions `settlement.read`, `settlement.manage` (owner; fresh identity check for terms and payouts). Strings `s16Settlement`. Config `config/s16-settlement.ts`. Records only, no movement of money (D24). Guide: `docs/integrations/settlement.md`. Not built: automatic entries, posting to STEP 15, sub-merchant statement page, reserves, tax, other currencies, processor payouts, recovery of a negative balance.
