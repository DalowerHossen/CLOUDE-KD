# STEP 16 - Sub-steps plan

Branch: `claude/clever-goldberg-8ncdae`, continued from the end of STEP 15 (STEPs 02 to 15 are not on `origin/integration` yet; `origin/integration` is an ancestor of this branch, so the branch contains it). Migration block `S16_*`. Every sub-step ends with `npm run lint`, typecheck (with the larger heap, R8 of STEP 15), `scripts/check-all.sh`, `scripts/db-apply.sh --clean` (when it has a migration), `scripts/run-assertions.sh s16` and its own `scripts/verify/step16-*.ts`, then one commit `feat(step16): 16.k <summary>` and a push.

FEATURE_LIST item numbers (Part 6, written in Bengali, UI stays English): A WhatsApp 1941-2030, B social 2031-2092, C share widgets 2093-2107, D public API and outgoing webhooks 2108-2182 (D1 2108-2112, D2 2113-2135, D3 2136-2150, D4 2151-2158, D5 2159-2182), E Zapier, Make, Chrome, developer portal 2183-2207, F bank feed and smart reconciliation 2208-2239, G OCR 2240-2255, I multi-channel 2281-2303, K migration wizard 2334-2353. Part 3: J commerce 1091-1115. Part 9: I webhook security 3348-3356. Part 10: B cron jobs 3476-3495. (Boundaries are the first numbers of each section in the file; each sub-step re-reads its exact lines.)

Security checks for all sub-steps: Z1 to Z14 of STEP_PROTOCOL section 6. Plus: provider tokens and signing secrets only through the encryption contract (purposes `oauth-tokens` and `processor-credentials` are not reused: integration secrets use purpose `oauth-tokens`; webhook signing secrets are stored encrypted and shown once); API keys shown once and stored as a hash; inbound webhooks verified by signature before parsing and idempotent by provider event id; outgoing targets pass the SSRF guard (no private, loopback, link-local or metadata addresses, checked again at connect time, no redirects followed); messaging checks the consent record before every send; sandbox data is isolated by a flag in the database, never mixed with live data; rule 18 (no payment brand names); all money through `Money`.

Contracts consumed (present in `types/contracts/`): events, audit, permissions, approval, jobs, locks, consent, auth, security, idempotency, encryption, storage, email, notification, tokens, client, invoice, payment, entitlement. Provided: none new. Events consumed by outgoing webhooks and automation: all names of `types/events.ts` (`invoice.*`, `estimate.*`, `payment.*`, `dispute.*`, `payout.*`, `client.*`, `file.*`). Events published here: `receipt.ocr_completed` is NOT in the contract (see R2); the OCR sub-step calls `applyOcrResult` of STEP 15 as its R6 asked.

## Known inputs found while planning (see DEPENDENCY_REQUESTS.md)

- The `clients` and `invoices` contracts offer only reads for a payment (`getById`, `getBilling`, `getForPayment`). The public API (clients, products, invoices, estimates, payment links), the e-commerce order sync (client plus invoice draft) and the migration wizard (import) need list, create and update operations. Reading other STEPs' tables is read-only data access (the way STEP 15 reads invoices); writes must not go around the owning services. Request R1 asks for contract methods. Sub-steps 16.1.b, 16.5 and 16.10 build the read side first and stop with `BLOCKERS.md` for the write side if R1 has not been answered when they are reached.
- STEP 15 asked (R6, R7 of its requests) that OCR and the bank feed call `applyOcrResult(companyId, receiptId, {...})` and `importFeedBatch(companyId, bankAccountId, batchId, lines)` directly. These two functions are the only direct cross-STEP calls of STEP 16 and are isolated in `services/ocr/ports.ts` and `services/bankfeed/ports.ts` so the Integrator can replace them by an event or contract.
- Cron files in this repository are named `cron/jobs/s<NN>-<name>.ts` (the scope text says `16-*`); this STEP uses `cron/jobs/s16-*.ts` and `workers/integrations/` as the ownership map says.
- Provider documentation rule: CLAUDE.md section 8 is written for payment processors; SCOPE.md extends it to every social adapter. This STEP applies it to every external provider (Meta Cloud API, each social network, Shopify, WooCommerce, Plaid, Salt Edge, Google Cloud Vision, Zapier, Make): the latest official documentation is read in the session first and its facts and date are written to `docs/integrations/<id>.md` before the adapter code. If a documentation site cannot be reached, that adapter sub-step stops and is reported.
- Package needs (Plaid client, Google Vision client, QR, zip, SDK build) are written to `DEPENDENCY_REQUESTS.md`; adapters use `fetch` against the REST APIs so no package is required to start.

## 16.1.a Public API: keys, versioning, limits, sandbox

- Goal: API keys (random secret shown once, SHA-256 hash stored, prefix and last characters shown, scopes such as `read:invoices` and `write:clients`, expiry, rotation with an overlap window, revoke, last used time and IP, per-key rate limit), a `withPublicApi()` wrapper (key lookup, scope check giving 403 outside the scope, tenant from the key, correlation id, rate limit headers `X-RateLimit-Limit|Remaining|Reset`, idempotency key support, cursor pagination helpers, uniform error body, version header `v1`), sandbox keys that read and write only rows flagged sandbox, usage log per key and a per-key anomaly check.
- Files: `migrations/S16_001_api_keys.sql` (+ `_down`; `api_keys`, `api_key_usage`), `sql/assertions/s16_001_api_keys.sql`, `config/permissions/s16-api.ts`, `lib/integrations/{api-key-rules,public-api}.ts`, `services/publicapi/{keys,usage,register}.ts`, `app/api/developers/keys/**`, `lib/i18n/strings/en/s16-developers.ts`, `scripts/verify/step16-api-keys.ts`.
- Migrations: `S16_001_api_keys`.
- FEATURE_LIST: D1, D3 (2108-2112, 2136-2150) and the key items of E4.
- Done when: a key outside its scope gets 403; the secret is never stored; a rotated key works during the overlap and not after; rate limit headers are present; a sandbox key cannot see live rows (assertion).

## 16.1.b Public API: resources, OpenAPI, developer portal

- Goal: `app/api/public/v1` endpoints: clients, products, invoices (list, get, payment link), payments (read), estimates (list, get), filtering, sorting, cursor pagination, idempotent POST, webhook-style `Idempotency-Key`; the OpenAPI 3.1 document built from the same Zod schemas and served at `/api/public/v1/openapi.json`; the status feed (JSON/RSS); developer portal `app/(dashboard)/developers` (key management with one-time secret view, scopes picker, usage, docs page, sandbox toggle, changelog).
- Files: `lib/integrations/{openapi,public-schemas}.ts`, `services/publicapi/{resources,openapi,status}.ts`, `app/api/public/v1/**`, `app/(dashboard)/developers/**`, `components/developers/*`, `scripts/verify/step16-public-api.ts`.
- Migrations: none.
- FEATURE_LIST: D2, D4 (2113-2135, 2151-2158) and the portal items of E4 (2203-2207 except SDK publishing).
- Done when: every endpoint is described in the OpenAPI file and the file validates; a foreign tenant id gives 404; list endpoints page by cursor without gaps; write endpoints stop with a `BLOCKERS.md` entry if R1 is open (reads are complete).

## 16.2 Outgoing webhooks

- Goal: endpoint management (URL, event selection, description, secret shown once, secret rotation with two valid signatures for 24 hours), HMAC-SHA256 signature with timestamp (`lib/webhook` signature helpers), SSRF guard, outbox of deliveries with retries and exponential backoff, delivery log with response status and a clipped body, manual replay, test ping, automatic disable after repeated failure with a notice, subscription to the domain events.
- Files: `migrations/S16_002_webhooks_out.sql` (+ `_down`; `webhook_endpoints`, `webhook_deliveries`), `sql/assertions/s16_002_webhooks_out.sql`, `lib/integrations/{ssrf,webhook-rules}.ts`, `services/webhookout/{endpoints,deliveries,dispatch,register}.ts`, `workers/integrations/webhook-fanout.event.ts`, `app/api/integrations/webhooks/**`, `app/(dashboard)/developers/webhooks/**`, `scripts/verify/step16-webhooks-out.ts`.
- Migrations: `S16_002_webhooks_out`.
- FEATURE_LIST: D5 (2159-2182), Part 9 I (3348-3356, outgoing side).
- Done when: private, loopback and metadata addresses are refused (script); the retry schedule is exact; an endpoint is disabled after the configured number of failed deliveries; replay sends the original payload with a new signature timestamp.

## 16.3.a WhatsApp: configuration, templates, sending, inbound, consent

- Goal: Meta Cloud API client (documentation read first), configuration per company (WABA, phone number id, encrypted token and app secret, health check, sandbox mode), template manager and submission, template library, send (text and template, media with the file storage), per-recipient consent and the opt-out list that blocks sending, delivery status tracking, inbound webhook `app/api/webhooks/whatsapp` (GET challenge, POST with `X-Hub-Signature-256` verified before parsing, idempotent by message id), inbound replies, STOP keyword handling.
- Files: `docs/integrations/whatsapp.md`, `migrations/S16_003_whatsapp.sql` (+ `_down`; `whatsapp_accounts`, `whatsapp_templates`, `whatsapp_messages`, `whatsapp_optouts`), `sql/assertions/s16_003_whatsapp.sql`, `lib/whatsapp/{client,rules}.ts`, `services/whatsapp/{accounts,templates,send,inbound,consent,register}.ts`, `app/api/whatsapp/**`, `app/api/webhooks/whatsapp/route.ts`, `app/(dashboard)/whatsapp/**`, `scripts/verify/step16-whatsapp.ts`.
- Migrations: `S16_003_whatsapp`.
- FEATURE_LIST: A1, A2, A3, A7, A8 (1941-1978 approx., 2011-2030).
- Done when: sending to an opted-out number is refused before any call (script); a bad signature is rejected with a security event; a repeated inbound message id changes nothing.

## 16.3.b WhatsApp: automation rules, campaigns, delivery reports

- Goal: automation rules (event, condition, template, dry-run mode that records what would be sent, enable and disable per rule), reminders for overdue and pending invoices, bulk campaigns with segments (tag, balance, last invoice), Meta tier rate limit, scheduling, delivery report and failure reasons, retry of failed deliveries.
- Files: `migrations/S16_004_whatsapp_automation.sql` (+ `_down`; `whatsapp_rules`, `whatsapp_campaigns`, `whatsapp_campaign_items`), `sql/assertions/s16_004_whatsapp_automation.sql`, `services/whatsapp/{rules,campaigns,report}.ts`, `workers/integrations/whatsapp-rules.event.ts`, `app/api/whatsapp/{rules,campaigns}/**`, `app/(dashboard)/whatsapp/{rules,campaigns}/**`, `scripts/verify/step16-whatsapp-campaigns.ts`.
- Migrations: `S16_004_whatsapp_automation`.
- FEATURE_LIST: A4, A5, A6 (1979-2010).
- Done when: dry run sends nothing and logs the rendered message; a campaign never exceeds the tier limit per day; every campaign item respects the opt-out list.

## 16.4.a Social: connections, adapters, composer

- Goal: provider documentation read first for each adapter (Facebook, Instagram, LinkedIn, X, Threads, Telegram, Pinterest); connection by OAuth or bot token with encrypted tokens, reconnect, adapter interface and registry, per-platform formats and limits, post composer (text, emoji, hashtags, image), hashtag library, sandbox adapter.
- Files: `docs/integrations/social-<id>.md` (seven files), `migrations/S16_005_social.sql` (+ `_down`; `social_accounts`, `social_posts`, `social_hashtag_groups`), `sql/assertions/s16_005_social.sql`, `lib/social/{adapter,registry,rules}.ts`, `lib/social/adapters/{facebook,instagram,linkedin,x,threads,telegram,pinterest,sandbox}.ts`, `services/social/{accounts,posts,hashtags,register}.ts`, `app/api/social/**`, `app/(dashboard)/social/**`, `scripts/verify/step16-social.ts`.
- Migrations: `S16_005_social`.
- FEATURE_LIST: B1 to B3 (2031-2056).
- Done when: each adapter file starts with the documentation date it was written from; text limits are enforced per platform; tokens are never returned to the client.

## 16.4.b Social: scheduling, rules, approval, analytics, share widgets

- Goal: content calendar, scheduler job that publishes due posts (sandbox publishes in the sandbox adapter), recurring schedules, auto-post rules (event, platforms, template), evergreen queue and re-post variations, approval flow (staff submits, owner approves) through the approval contract, post analytics (clicks by tracked link, engagement rate), share buttons and the social proof widget for the public blog and invoice pages (`components/social/*`).
- Files: `migrations/S16_006_social_schedule.sql` (+ `_down`; `social_schedules`, `social_rules`, `social_post_stats`, `social_links`), `sql/assertions/s16_006_social_schedule.sql`, `config/approval/s16-social.ts`, `services/social/{schedule,rules,evergreen,analytics,links}.ts`, `workers/integrations/social-rules.event.ts`, `app/api/social/{schedule,rules,analytics}/**`, `app/(dashboard)/social/{calendar,rules,analytics}/**`, `components/social/*`, `scripts/verify/step16-social-schedule.ts`.
- Migrations: `S16_006_social_schedule`.
- FEATURE_LIST: B4 to B8, C (2057-2107).
- Done when: a scheduled post in sandbox publishes once at its time and not twice on a second run; an unapproved post is never published.

## 16.5 Commerce: Shopify and WooCommerce

- Goal: connections (documentation read first), order and product sync, field mapping, sync log, conflict handling, webhook intake `app/api/webhooks/shopify` and `woocommerce` (signature verified, idempotent by webhook id), order creates a client (matched by email) and an invoice draft once.
- Files: `docs/integrations/{shopify,woocommerce}.md`, `migrations/S16_007_commerce.sql` (+ `_down`; `integrations`, `integration_sync_log`, `integration_mappings`), `sql/assertions/s16_007_commerce.sql`, `lib/integrations/{shopify,woocommerce,mapping-rules}.ts`, `services/integration/{connections,orders,products,conflicts,register}.ts`, `app/api/integrations/**`, `app/api/webhooks/{shopify,woocommerce}/route.ts`, `app/(dashboard)/integrations/**`, `scripts/verify/step16-commerce.ts`.
- Migrations: `S16_007_commerce`.
- FEATURE_LIST: Part 3 J1 to J3 (1091-1115).
- Done when: a duplicate order webhook creates nothing; mapping conflicts are listed; the order creation stops with `BLOCKERS.md` if R1 is open.

## 16.6 Automation tools

- Goal: Zapier and Make endpoints (triggers by polling and by hook subscription, actions create invoice, create client, record payment note), authentication by API key with scopes, Chrome extension package source (`integrations/chrome-extension/` as plain files in the owned folder `lib/integrations/chrome/`), QR scan helpers.
- Files: `lib/integrations/{zapier,make,chrome}/*`, `services/integration/automation.ts`, `app/api/integrations/{zapier,make}/**`, `app/(dashboard)/integrations/automation/**`, `scripts/verify/step16-automation.ts`.
- Migrations: none (hook subscriptions are rows of `webhook_endpoints` with a `source` column added in `S16_002`).
- FEATURE_LIST: E1 to E3 (2183-2202).
- Done when: a trigger poll returns new rows once; an action runs with the key's scope only.

## 16.7 Bank feed

- Goal: Plaid and Salt Edge adapters (documentation read first), account linking, re-authentication, encrypted tokens, transaction import with hash based de-duplication, hand-over to STEP 15 (`importFeedBatch`), smart match suggestions (amount, date window, reference, name similarity), one-click accept, monthly reconciliation report.
- Files: `docs/integrations/{plaid,saltedge}.md`, `migrations/S16_008_bankfeed.sql` (+ `_down`; `bank_feed_connections`, `bank_feed_batches`, `bank_feed_suggestions`), `sql/assertions/s16_008_bankfeed.sql`, `lib/integrations/{plaid,saltedge,match-rules}.ts`, `services/bankfeed/{connections,import,suggestions,ports,register}.ts`, `app/api/integrations/bank/**`, `app/(dashboard)/integrations/bank/**`, `scripts/verify/step16-bankfeed.ts`.
- Migrations: `S16_008_bankfeed`.
- FEATURE_LIST: F (2208-2239).
- Done when: importing the same batch twice changes nothing; the matcher gives the expected candidates for the sample table.

## 16.8 Receipt OCR

- Goal: Google Cloud Vision adapter (documentation read first), processing queue with the job states, extraction of vendor, date, tax and total from the text, confidence per field, manual correction, hand-over to STEP 15 (`applyOcrResult`, and `null` on failure), expense creation event.
- Files: `docs/integrations/google-vision.md`, `migrations/S16_009_ocr.sql` (+ `_down`; `ocr_jobs`), `sql/assertions/s16_009_ocr.sql`, `lib/ocr/{vision,extract-rules}.ts`, `services/ocr/{jobs,extract,ports,register}.ts`, `app/api/integrations/ocr/**`, `app/(dashboard)/integrations/ocr/**`, `scripts/verify/step16-ocr.ts`.
- Migrations: `S16_009_ocr`.
- FEATURE_LIST: G (2240-2255).
- Done when: the sample receipt texts give the expected fields (case table); a failed job reports `null` to STEP 15 once.

## 16.9 Multi-channel messaging

- Goal: channel routing by client preference and consent (e-mail, WhatsApp, in-app, plus SMS only if an adapter is documented), additional channel adapters, multi-channel campaigns, A/B tests by channel with a winner rule.
- Files: `migrations/S16_010_messaging.sql` (+ `_down`; `messaging_routes`, `messaging_campaigns`, `messaging_variants`), `sql/assertions/s16_010_messaging.sql`, `services/messaging/{routing,campaigns,ab,register}.ts`, `app/api/integrations/messaging/**`, `app/(dashboard)/integrations/messaging/**`, `scripts/verify/step16-messaging.ts`.
- Migrations: `S16_010_messaging`.
- FEATURE_LIST: I (2281-2303).
- Done when: a recipient without consent on a channel is skipped and the next allowed channel is used; the A/B winner is chosen by the stated rule.

## 16.10 Migration wizard

- Goal: import from other invoicing tools by file (CSV/JSON) with column mapping, validation report, dry run, commit in batches, rollback of a batch; built on the import jobs of STEP 08 where they exist.
- Files: `migrations/S16_011_migration.sql` (+ `_down`; `migration_jobs`, `migration_rows`), `sql/assertions/s16_011_migration.sql`, `services/migration/{jobs,mapping,validate,commit,rollback,register}.ts`, `app/api/migration/**`, `app/(dashboard)/migration/**`, `scripts/verify/step16-migration.ts`.
- Migrations: `S16_011_migration`.
- FEATURE_LIST: K (2334-2353).
- Done when: a dry run writes nothing; rollback removes exactly the rows a batch created; the commit stops with `BLOCKERS.md` if R1 is open.

## 16.11 Cron jobs, workers and closure

- Goal: `cron/jobs/s16-*.ts` for the integration jobs (webhook retry, key expiry notices, WhatsApp campaign tick, social publish, commerce sync, bank feed refresh, OCR queue, migration cleanup, usage rollup), workers under `workers/integrations/`, whole-STEP verification, `HANDOFF.md` (endpoints, scopes, event types, provider documentation dates, env keys, cron jobs).
- Files: `cron/jobs/s16-*.ts`, `workers/integrations/*`, `docs/steps/STEP-16/{VERIFY,HANDOFF}.md`.
- FEATURE_LIST: Part 10 B (3476-3495).
- Done when: every job in the list exists, is idempotent and appears in the generated cron list; the whole-STEP verification of SCOPE.md is recorded in `VERIFY.md`.

## 16.12 Sub-merchant gateway (owner request, 2026-10-24)

A main merchant (a company) lets its own sub-merchants call the main merchant's app through the platform. A sub-merchant holds a key made by the platform; the platform checks it, limits it, signs the request with the main merchant's signing secret and calls the main merchant's app at a fixed address. The sub-merchant never sees the address or the secret of the main merchant's app. Design decisions are D22 in `DECISIONS.md`.

### 16.12.a Tables

- Goal: `gateway_upstreams` (one per company: base address, sealed signing secret and its rotation, state), `gateway_routes` (the allowed method and path templates), `sub_merchants`, `sub_merchant_keys` (hashed, with address allow list), `gateway_calls` (append-only log, no bodies), `gateway_key_windows` and `kd_gateway_hit` (per-key limit).
- Files: `migrations/S16_019_gateway.sql` (+ `_down`), `sql/assertions/s16_019_gateway.sql`.
- Done when: RLS is on, the company of every child row matches its parent, a key hash is unique, the call log cannot change, the hit counter counts.

### 16.12.b Rules (pure)

- Goal: inputs, path templates and matching (no traversal, no encoded slashes), the request signature, header filters for both directions, the address allow list, the key format, the answer mapping.
- Files: `config/s16-gateway.ts`, `lib/gateway/rules.ts`, `scripts/verify/step16-gateway.ts`.
- Done when: the verify script checks every rule with a fake transport.

### 16.12.c Services

- Goal: manage upstream, routes, sub-merchants and keys (audited, optimistic lock, step-up for secrets); the forwarding service.
- Files: `services/gateway/{upstream,routes,sub-merchants,keys,forward,db}.ts`, `lib/security/ssrf.ts` (methods PUT, PATCH, DELETE added to the guarded request).
- Done when: the forwarding service passes the verify script with fake storage and a fake transport.

### 16.12.d Routes and pages

- Goal: the gateway entry `app/api/gateway/v1/[...path]/route.ts`, the management routes `app/api/integrations/gateway/**`, the page `(dashboard)/integrations/gateway`, strings, permissions `gateway.read` and `gateway.manage`, navigation.
- Done when: lint, types and guards are clean.

### 16.12.e Closure

- Goal: `docs/integrations/gateway.md` (how a sub-merchant calls, how the main merchant verifies the signature), VERIFY, HANDOFF, PROGRESS.

## 16.13 Sub-merchant KYC (owner request, 2026-10-24)

A main merchant verifies its own sub-merchants before they may call the gateway. The sub-merchant has no login: it gets a secure link, fills the business details and the owners, uploads the four documents and submits. The main merchant reviews and decides. The platform screens the names against the sanctions lists and the restricted countries and does not let the main merchant approve a match. Design decisions are D23 in `DECISIONS.md`.

### 16.13.a Tables

- Goal: `sub_merchant_kyc` (a submission per round), `sub_merchant_kyc_documents`, `sub_merchant_kyc_links` (hashed one-way links), `sub_merchants.kyc_approved_until`, `gateway_upstreams.kyc_required`.
- Files: `migrations/S16_020_sub_merchant_kyc.sql` (+ `_down`), `sql/assertions/s16_020_sub_merchant_kyc.sql`.

### 16.13.b Rules and services

- Goal: inputs, link tokens, readiness, review actions; services for the link, the applicant (view, business, owners, documents, submit) and the reviewer (queue, detail, document view logged, start with screening, documents, note and risk, approve, request changes, reject); the gateway refuses a sub-merchant that is not verified when the upstream asks for it.
- Files: `lib/gateway/kyc-rules.ts`, `services/gateway/{kyc-links,kyc-applicant,kyc-review}.ts`, the gate in `services/gateway/{forward,keys,upstream}.ts`, `scripts/verify/step16-gateway-kyc.ts`.

### 16.13.c Routes and pages

- Goal: public tokenised routes `app/api/gateway-kyc/[token]/**`, management routes `app/api/integrations/gateway/kyc/**`, the applicant page `(client-portal)/skyc/[token]`, the review area on the gateway page, strings, permission `gateway.kyc.review`.

### 16.13.d Closure

- Goal: `docs/integrations/gateway-kyc.md`, VERIFY, HANDOFF, PROGRESS.

## 16.14 Sub-merchant settlement ledger (owner request, 2026-10-24)

The records of what a main merchant owes each of its sub-merchants: terms (commission, fixed fee, hold days, minimum payout), the entries of sales, refunds, chargebacks and adjustments with the commission worked out and kept, the balance (available, pending, paid), payouts that the main merchant made and recorded, and statements. The platform keeps the books; it does not hold, receive or send money. Design decisions are D24 in `DECISIONS.md`.

### 16.14.a Tables and functions

- Goal: `settlement_terms` (versions), `settlement_entries` (append-only), `settlement_payouts`, `kd_settlement_balance`, `kd_settlement_record_payout` (atomic, idempotent), `kd_settlement_entries_text` (amounts as text).
- Files: `migrations/S16_021_settlement.sql` (+ `_down`), `sql/assertions/s16_021_settlement.sql`.

### 16.14.b Rules and services

- Goal: inputs, the working out of one entry with `Money`, terms lookup, posting in batches with duplicate detection, balance, payouts (record, void), statement as CSV.
- Files: `lib/gateway/split-rules.ts`, `services/gateway/{terms,entries,balances,transfers}.ts`, `scripts/verify/step16-settlement.ts`.

### 16.14.c Routes and page

- Goal: `app/api/integrations/settlement/**`, `(dashboard)/integrations/settlement`, strings, permissions `settlement.read` and `settlement.manage`, navigation.

### 16.14.d Closure

- Goal: `docs/integrations/settlement.md`, VERIFY, HANDOFF, PROGRESS.

## 16.15 Automatic settlement entries (owner request, 2026-10-24)

The main merchant's app posts sales, refunds and chargebacks of its sub-merchants to the platform by itself, with a key made for that purpose, instead of the owner typing them. Design decisions are D25 in `DECISIONS.md`.

### 16.15.a Table

- Goal: `settlement_ingest_keys` (hashed, limit, optional address list, expiry, revoke).
- Files: `migrations/S16_022_settlement_ingest.sql` (+ `_down`), `sql/assertions/s16_022_settlement_ingest.sql`.

### 16.15.b Rules and services

- Goal: key format and header, the batch input by sub-merchant reference, key management (audited), authentication, the entry posting made reusable for the owner and for a key.
- Files: `lib/gateway/ingest-rules.ts`, `services/gateway/ingest-keys.ts`, `services/gateway/entries.ts`, `scripts/verify/step16-settlement-ingest.ts`.

### 16.15.c Route, page and closure

- Goal: `POST /api/gateway/settlement/v1/entries`, key management routes and the section on the settlement page, docs, VERIFY, HANDOFF, PROGRESS.

## 16.16 White-label hosted checkout API (owner request, 2026-10-25)

A merchant's store (WooCommerce, Shopify or its own code) gets a key after its business check (KYC) is approved. For each order it asks the platform for a checkout session and sends the buyer to the returned address, a payment page with the platform's brand. The buyer needs no account; one order is one session and a paid order cannot be paid again; the store learns the result through webhooks. The merchant never sees which processor or master merchant the platform uses. Design decisions are D37 in `DECISIONS.md`.

### 16.16.a Contracts (the Integrator's part)

- Goal: `invoices.createForOrder`, `invoices.voidForOrder`, `payments.createLink`, `payments.revokeLink` (resolves BLOCKERS B1 for this feature only), the events `checkout.session.paid` and `checkout.session.failed`.
- Files: `types/contracts/{invoice,payment}.ts`, `types/events.ts`, `services/invoice/order-invoice.ts`, `services/payment/order-links.ts`, the two `register.ts`, `docs/execution/CONTRACTS.md`.

### 16.16.b Table

- Goal: `checkout_sessions` (one row per order of a company, claim state `creating`, sealed address, https return addresses).
- Files: `migrations/S16_028_checkout_sessions.sql` (+ `_down`), `sql/assertions/s16_028_checkout_sessions.sql`.

### 16.16.c Rules, service, routes

- Goal: strict input, the claim, KYC gate, replay, reopen, cancel; `POST/GET/DELETE /api/public/v1/checkout/sessions`; scopes `read:checkout` and `write:checkout` (live keys only after KYC); the event worker that writes the webhook events; the return to the store on the hosted page.
- Files: `lib/checkout/session-rules.ts`, `services/checkout/sessions.ts`, `app/api/public/v1/checkout/**`, `workers/integrations/checkout-session-events.event.ts`, `lib/integrations/public-registry.ts`, `components/payment/checkout-panel.tsx`, `scripts/verify/step16-checkout.ts`.

### 16.16.d Owner page and closure

- Goal: `(dashboard)/developers/checkout` (KYC state, key, steps), `docs/integrations/checkout-api.md`, VERIFY, PROGRESS.

## 16.17 Find a payment by the last four digits of the card (owner request, 2026-10-25)

Support staff find a payment across all companies by the last four digits of the card, and an owner finds payments of the own company; the result shows the merchant, the payer, the amount and the time. Design decisions are D38 in `DECISIONS.md`.

### 16.17.a Storage and adapters

- Goal: `payments.card_last4` and `card_brand`, the digits and the brand on `CardIdentity`, the adapters that already read them pass them on, the payment core keeps them.
- Files: `migrations/S16_029_payment_card_last4.sql` (+ `_down`), `sql/assertions/s16_029_payment_card_last4.sql`, `lib/payment/card-facts.ts`, `types/contracts/payment-adapter.ts`, `lib/payment/adapters/*/mapping.ts`, `services/payment/{payments,payment-store}.ts`.

### 16.17.b Search, routes and pages

- Goal: input rules, the search service with the platform guards and the audit entry, `POST /api/admin/payments/card-search`, `POST /api/payments/card-search`, the two pages, permission `payment.card.search`, navigation, strings.
- Files: `lib/payment/card-search-rules.ts`, `services/payment/card-search.ts`, `app/api/**/card-search/route.ts`, `app/(admin)/admin/payments/card-search`, `app/(dashboard)/payments/card-search`, `components/payment/card-search.tsx`, `scripts/verify/step16-card-search.ts`.

## 16.18 Connect with Facebook (owner request, 2026-10-25)

- Goal: the owner connects Pages and Instagram through the platform's Meta app. Decisions are D40.
- Files: `migrations/S16_030_social_connect.sql` (+ `_down`), `sql/assertions/s16_030_social_connect.sql`, `lib/env/s16.ts`, `config/env/s16.env.fragment`, `config/s16-social.ts`, `lib/social/meta-oauth.ts`, `services/social/meta-connect.ts`, `app/api/social/connect/facebook/{start,callback,select}`, `(dashboard)/social/connect`, `components/social/facebook-picker.tsx`, `scripts/verify/step16-meta-connect.ts`.

## 16.19 Platform setup wizard, eight steps (owner request, 2026-10-26)

- Goal: FEATURE_LIST H1 (2654-2664). After the approval mode, eight steps: branding, e-mail, payment processors, plans, domains, payout partners, WhatsApp, analytics; a completion checklist; a re-run. Decisions are D42.
- 16.19.a Data: `migrations/S16_031_platform_setup_steps.sql` (+ `_down`), `sql/assertions/s16_031_platform_setup_steps.sql`, `lib/company/ops-input.ts` (`WIZARD_STEPS`, `OPTIONAL_WIZARD_STEPS`, `setupSchema`).
- 16.19.b Service and page: `services/company/platform-setup.ts` (live "found / not found" per step, skip rule, re-run), `app/(admin)/admin/setup/_components/setup-wizard.tsx`, strings `s07Company.adminOps.wiz*`, `scripts/verify/step16-setup-wizard.ts`.

## 16.20 Admin home metrics (owner request, 2026-10-26)

- Goal: FEATURE_LIST A1 (2354-2365): MRR and ARR, subscription revenue this month and this year, invoices this month, payment volume this month, a platform health score, quick actions. Counters, queues and the activity feed already existed. Decisions are D43.
- Files: `lib/admin/health-score.ts`, `services/company/admin-metrics.ts`, `app/(admin)/admin/page.tsx`, strings `s07Company.adminPeople.*`, `scripts/verify/step16-admin-health.ts`.

## 16.21 User actions for the platform team (owner request, 2026-10-26)

- Goal: FEATURE_LIST A2 (2374-2380): delete with a 30 day grace, permanent removal after it, forced password reset, two-step sign-in reset, e-mail change, plan change. Suspend, reactivate, e-mail verification and notes already existed. Decisions are D44.
- 16.21.a Data: `migrations/S16_032_admin_user_actions.sql` (+ `_down`), `sql/assertions/s16_032_admin_user_actions.sql` (`user_deletions`, `kd_user_purge`, wider action list, `params`).
- 16.21.b Service and page: `lib/company/admin-input.ts`, `config/approval/s07-admin.ts`, `services/company/admin.ts`, `services/auth/reset-flow.ts` (`sendAdminReset`), `app/(admin)/admin/_components/people-actions.tsx`, `app/(admin)/admin/users/[id]/page.tsx`, `scripts/verify/step16-user-actions.ts`.

## 16.22 Operations controls (owner request, 2026-10-26)

- Goal: FEATURE_LIST L1 to L2 (2756-2767): maintenance mode, job queue monitor with retry, configuration screen, global kill switch, request cap per company. Decisions are D45.
- 16.22.a Data: `migrations/S16_033_platform_controls.sql` (+ `_down`), `sql/assertions/s16_033_platform_controls.sql` (`platform_controls`, `kill_switches`, `tenant_rate_limits`).
- 16.22.b Rules and services: `lib/platform/controls.ts`, `services/platform/{controls,jobs,config-status}.ts`, `MaintenanceError`, `companyCapHit` in `services/security/rate-limit.ts`.
- 16.22.c Enforcement: `lib/api/with-api.ts` and `lib/integrations/public-api.ts` (maintenance, company cap), `app/(dashboard)/layout.tsx` (maintenance notice), `services/company/module-access.ts` (kill switch).
- 16.22.d Screens: `/admin/system`, `/admin/system/jobs`, `/admin/system/config`, routes `app/api/admin/system/*`, permissions `system.read` and `system.manage`, navigation, strings, `scripts/verify/step16-system-controls.ts`.

## 16.23 Custom limits per company (owner request, 2026-10-26)

- Goal: FEATURE_LIST A4 2395. Decisions are D46.
- Files: `migrations/S16_034_tenant_limit_overrides.sql` (+ `_down`), `sql/assertions/s16_034_tenant_limit_overrides.sql`, `lib/platform/tenant-overrides.ts`, `services/entitlement/{overrides,entitlement}.ts`, `services/platform/tenant-overrides.ts`, `app/api/admin/system/tenant-overrides/route.ts`, `app/(admin)/admin/_components/limit-overrides-panel.tsx`, the company page, `scripts/verify/step16-tenant-overrides.ts`.

## 16.24 Company insight, support bundle and global search (owner request, 2026-10-26)

- Goal: FEATURE_LIST A4 2397 to 2400, 2403 and 2405: API use, e-mail use, health score with churn signals, support export, search over all companies. Storage and quota bars reuse the existing quota meters. Decisions are D47.
- Files: `lib/platform/{tenant-insight,global-search}.ts`, `services/platform/{tenant-insight,tenant-export,global-search}.ts`, `app/api/admin/system/tenant-export/route.ts`, `app/(admin)/admin/_components/{tenant-insight-panel,support-export-button}.tsx`, `app/(admin)/admin/search/page.tsx`, the company page, navigation, strings, `scripts/verify/step16-tenant-insight.ts`.

## 16.25 Checked against live data, plan quotas for e-mail and API, payment search (owner request, 2026-10-26)

- Goal: the figures of 16.20 and 16.24 compared with the live database; e-mail and API calls become plan features with quota bars (they were plain figures); payments can be found in the platform search. Decisions are D48.
- Files: `services/subscription/analytics.ts`, `services/platform/tenant-insight.ts`, `config/plans.ts`, `lib/payment/plan-rules.ts`, `lib/cms/pricing.ts`, `lib/i18n/strings/en/s14-wallet.ts`, `services/entitlement/usage.ts`, `lib/integrations/public-api.ts`, `lib/platform/global-search.ts`, `services/platform/global-search.ts`, `scripts/verify/step16-plan-quotas.ts`, `scripts/verify/step16-tenant-insight.ts`.

## 16.26 What's new and product tours (owner request, 2026-10-26)

- Goal: FEATURE_LIST M2 2795 and 2796. Decisions are D49.
- Files: `migrations/S16_035_release_notes.sql` (+ `_down`), `sql/assertions/s16_035_release_notes.sql`, `lib/platform/release-notes.ts`, `services/platform/release-notes.ts`, `app/api/whats-new/route.ts`, `app/api/admin/releases/route.ts`, `app/(dashboard)/whats-new`, `app/(admin)/admin/releases`, `app/(dashboard)/layout.tsx` (unseen banner), `config/permissions/s16-releases.ts`, navigation, strings `s16Growth`, `scripts/verify/step16-release-notes.ts`.

## 16.27 Exit survey and downgrade-save (owner request, 2026-10-26)

- Goal: FEATURE_LIST M2 2792 and 2793. Decisions are D50.
- Files: `migrations/S16_036_retention.sql` (+ `_down`), `sql/assertions/s16_036_retention.sql`, `lib/platform/retention.ts`, `services/platform/retention.ts`, `app/api/retention/{offer,saved}/route.ts`, `app/api/admin/retention/route.ts`, `app/api/subscriptions/{cancel,change}/route.ts`, `app/(dashboard)/subscriptions/billing` (flow), `app/(admin)/admin/retention`, `config/permissions/s16-retention.ts`, navigation, strings, `scripts/verify/step16-retention.ts`.

## 16.28 Database job scheduler for the e-mail queue (owner request, 2026-10-27)

- Goal: held and scheduled messages go out without a scheduler on the host (Vercel Hobby runs a cron once a day at most). Decisions are D52.
- Files: `migrations/S16_037_job_scheduler.sql` (+ `_down`), `sql/assertions/s16_037_job_scheduler.sql`.

## 16.29 Feature list audit, first pass (owner request, 2026-10-27)

- Goal: the 4029 numbered features in 41 parts, each looked for in the code, so that the owner can decide what to build first. Report only; no feature code. Decisions are D53.
- Files: `docs/steps/STEP-16/AUDIT/` (`PART-01.md` to `PART-41.md`, `SUMMARY.md`, `CANDIDATE_GAPS.md`).

## 16.30 Feature list audit, second pass: the Bengali-only lines (owner request, 2026-10-27)

- Goal: the lines that the script could not read are read by a person against the code, part by part, and checked against what each STEP owner wrote down as not built. Report only. Decisions are D54.
- Files: `docs/steps/STEP-16/AUDIT/MANUAL-PART-NN.md` (parts 1 to 41), `MANUAL_SUMMARY.md`, `KNOWN_GAPS.md`, `CONFIRMED_FINDINGS.md`.
