# STEP 16 - Integrations and Automation

Wave C. Depends on: STEP 01 to 05; consumes invoices, payments, clients, events through contracts. Provides: public API, outgoing webhooks, messaging and social, bank feed, OCR, e-commerce sync.

## Feature sources

- Part 6 lines 2339-2700 (A WhatsApp, B social media, C share widgets, D public API and outgoing webhooks, E Zapier, Make, Chrome extension, developer portal, F bank aggregator and smart reconciliation, G OCR), 2729-2756 (I multi-channel messaging), 2792-2812 (K migration wizard)
- Part 3 lines 1333-1362 (J Shopify, WooCommerce, sync management)
- Part 9 lines 3971-3981 (I webhook security: outgoing side)
- Part 10 lines 4302-4322 (B cron job list: integration jobs)
- MASTER_PROMPT: integrations list, public REST API, rate limiting

## Owned paths and migrations

OWNERSHIP_MAP.md rows 16 and section 4. Migration block `S16_*`.

## Sub-steps

- 16.1 Public REST API v1: API keys (hashed, scoped, rotation), versioning, resource endpoints for clients, products, invoices, payments (read), estimates, pagination and filtering, idempotency, rate limit headers, sandbox keys with isolated data, OpenAPI document, developer portal `(dashboard)/developers` with docs and key management.
- 16.2 Outgoing webhooks: endpoint management, event selection, HMAC signature, outbox with retries and backoff, delivery log, replay, test ping, SSRF guard, disable on repeated failure.
- 16.3 WhatsApp (Meta Cloud API): configuration, template manager, send, automation rules (dry-run mode), bulk campaigns, delivery tracking, inbound replies, consent and opt-out, incoming webhook `app/api/webhooks/whatsapp`, sandbox mode.
- 16.4 Social media: connections and adapters (Facebook, Instagram, LinkedIn, X, Threads, Telegram, Pinterest), content calendar and composer, scheduler, auto-post rules, evergreen queue, approval flow, post analytics, share buttons and widgets; each adapter reads its provider's latest official documentation first (same rule as processors).
- 16.5 Commerce: Shopify and WooCommerce connections, order and product sync, mapping, sync logs and conflict handling, webhook intake `app/api/webhooks/shopify` and `woocommerce`.
- 16.6 Automation tools: Zapier and Make integration endpoints and triggers, Chrome extension package source, QR scan helpers.
- 16.7 Bank feed: Plaid and Salt Edge adapters, account linking, transaction import into the STEP 15 reconciliation, smart matching suggestions.
- 16.8 Receipt OCR: Google Cloud Vision adapter, processing queue, extraction of vendor, date, tax, total, manual correction, expense creation event for STEP 15.
- 16.9 Multi-channel messaging: channel routing, additional channel adapters, multi-channel campaigns, channel A/B tests.
- 16.10 Migration wizard: import from other invoicing tools by file mapping, validation, dry run, rollback.
- 16.11 Cron jobs and workers for all of the above (`cron/jobs/16-*`, `workers/integrations/`).

## Security notes

API keys shown once, stored hashed. Outgoing webhook targets pass the SSRF guard. Provider tokens encrypted through the encryption contract. Inbound webhooks verified by signature, idempotent. Messaging respects consent records.

## Verification

API key scope enforced (403 outside scope); rate limit headers present; outgoing webhook retries then disables; WhatsApp opt-out blocks sending; scheduled post publishes in sandbox; Shopify order creates a client and invoice draft once (duplicate webhook ignored); OCR sample receipts produce the expected fields; bank import creates reconciliation candidates.

## Handoff must list

Endpoints, scopes, event types, provider documentation dates, env keys, cron jobs.
