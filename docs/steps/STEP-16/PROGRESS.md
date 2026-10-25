# STEP 16 - Progress

- [x] 16.1.a Public API: keys, versioning, limits, sandbox (2026-10-23)
- [x] 16.1.b Public API: resources, OpenAPI, developer portal (2026-10-23)
- [x] 16.2 Outgoing webhooks (2026-10-23)
- [x] 16.3.a WhatsApp: configuration, templates, sending, inbound, consent (2026-10-23)
- [x] 16.3.b WhatsApp: automation rules, campaigns, delivery reports (2026-10-23)
- [x] 16.4.a Social: connections, adapters, composer, publishing (Facebook, Instagram, Threads, sandbox) (2026-10-23)
- [x] 16.4.a2 Social: LinkedIn, X, Telegram and Pinterest adapters (2026-10-23)
- [x] 16.4.b Social: scheduling, rules, approval, analytics, share widgets (2026-10-23)
- [x] 16.5 Commerce: Shopify and WooCommerce (2026-10-23; invoice drafts wait for R1, BLOCKERS B7)
- [x] 16.6 Automation tools (2026-10-23)
- [x] 16.7 Bank feed (2026-10-23; the matching and the report stay in STEP 15, D16)
- [x] 16.8 Receipt OCR (2026-10-23)
- [x] 16.9 Multi-channel messaging (2026-10-23)
- [x] 16.10 Migration wizard (2026-10-23)
- [x] 16.11 Cron jobs, workers and closure (2026-10-23; commerce and bank feed jobs wait for 16.5 and 16.7)
- [x] 16.12.a Sub-merchant gateway: tables (2026-10-24)
- [x] 16.12.b Sub-merchant gateway: rules (2026-10-24)
- [x] 16.12.c Sub-merchant gateway: services (2026-10-24)
- [x] 16.12.d Sub-merchant gateway: routes and pages (2026-10-24)
- [x] 16.12.e Sub-merchant gateway: closure (2026-10-24)
- [x] 16.13.a Sub-merchant KYC: tables (2026-10-24)
- [x] 16.13.b Sub-merchant KYC: rules and services (2026-10-24)
- [x] 16.13.c Sub-merchant KYC: routes and pages (2026-10-24)
- [x] 16.13.d Sub-merchant KYC: closure (2026-10-24)
- [x] 16.14.a Settlement ledger: tables and functions (2026-10-24)
- [x] 16.14.b Settlement ledger: rules and services (2026-10-24)
- [x] 16.14.c Settlement ledger: routes and page (2026-10-24)
- [x] 16.14.d Settlement ledger: closure (2026-10-24)
- [x] 16.15.a Automatic settlement entries: table (2026-10-24)
- [x] 16.15.b Automatic settlement entries: rules and services (2026-10-24)
- [x] 16.15.c Automatic settlement entries: route, page and closure (2026-10-24)

## Owner screens and fixes (owner request, after the first live run)

- Done: sign-out CSRF fix; short owner menu with "Show all features"; personal profile page and API; plan feature "no limit" fix (S16_023) with a self-healing seed; verify script `step16-owner-menu`.
- Not built (needs its own sub-steps): (a) payment link sent with the invoice only after verification (no verification check exists in the invoice or link services today); (b) a cancel option on the buyer's payment page; (c) a hosted checkout plug-in for Shopify and WooCommerce (today the platform only reads store orders through webhooks and REST); (d) page speed: not measured on the live site; the likely cause is the function region.

## Optional modules, Developers off by default, sign-up trial (owner request)

- Done: module catalogue (`config/features.ts`), flag reading with company override and rollout (`lib/features/rules.ts`, `services/company/module-access.ts`), menu, page and API gating, a Modules panel on Admin > Feature flags (all companies) and on the company page (one company), sign-up trial (`config/trial.ts`, `services/subscription/signup-trial.ts`), verify script `step16-modules`.
- Open: the public gateway call path is not yet refused for a company whose gateway module is off; a trial-ending reminder mail is sent only by the existing job (needs the scheduler); the trial plan and length are fixed in `config/trial.ts` (no admin screen yet).

## Verification (KYC) and plan at sign-up (owner request)

- Done: owner screen (previews, smaller photos, checklist, all countries), super admin verification settings (mode, service, documents, business questions), business answers (encrypted) and reviewer view, Sumsub hosted check with signed webhook, plan choice at sign-up, plan-tied modules. Verify scripts: `step16-kyc-owner`, `step16-kyc-profile`, `step16-kyc-sumsub`, `step16-modules`; database rules: `sql/assertions/s16_024_kyc_profile.sql`.
- Open: migrations S16_023 and S16_024 must be applied to the live database; the Sumsub calls were not run against a sandbox (D29 item 4); the pricing page links to the sign-up plan by hand; the first real upload failure on the live site was never seen (client-side shrinking and visible errors were added instead).
