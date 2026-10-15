# OWNERSHIP MAP (prevents conflicts and duplicates)

Every path belongs to exactly one STEP. A STEP writes only inside its own paths. `scripts/check-ownership.sh` compares the changed files of a branch with this map and fails on a violation. `.github/CODEOWNERS` mirrors it.

## 1. Shared-file policy

| Shared item | Owner | How other STEPs contribute |
|---|---|---|
| `package.json`, lockfile, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `netlify.toml`, `docker/`, `.github/workflows/` | Integrator (built in STEP 01) | Write `docs/steps/STEP-NN/DEPENDENCY_REQUESTS.md` (package, exact version, reason, files that use it). The Integrator applies it with `scripts/apply-dependency-requests.sh`. STEP 01 pre-installs the full planned stack so requests are rare. |
| `middleware.ts` | STEP 04 | Other STEPs add modules in `lib/middleware/<name>.ts` and one line in `config/middleware/<step>.ts`; `scripts/gen.sh` builds `lib/middleware/chain.generated.ts`. |
| `lib/i18n/strings/en.ts` | Integrator (generated barrel) | Each STEP writes `lib/i18n/strings/en/<domain>.ts`. |
| `config/nav-map.ts` | Integrator (generated) | Each STEP writes `config/nav/<step>.ts` (route, label key, icon, roles, group). |
| `config/permissions.ts`, `lib/auth/permissions.ts` matrix | STEP 02 owns the engine | Each STEP writes `config/permissions/<domain>.ts` (resource, action, default roles, approval level). |
| `.env.example`, env schema | Integrator (generated) | Each STEP writes `config/env/<step>.env.fragment` and `lib/env/<domain>.ts` (Zod fragment). |
| `types/database.ts` | Integrator (generated from the migrated database) | Never edited by hand. |
| `cron` schedule | Integrator (generated) | Each STEP writes `cron/jobs/<step>-<job>.ts` exporting `{ name, schedule, handler }`. |
| Service bootstrap | Integrator (generated `lib/bootstrap.generated.ts`) | Each STEP writes `services/<domain>/register.ts` that registers its implementation in the container. |
| Payment adapters index | Integrator (generated `lib/payment/adapters/index.generated.ts`) | Each adapter file exports `adapter`; the generator scans `lib/payment/adapters/*.ts`. |
| Migrations | Each STEP in its own number block | See section 2. |
| Docs index `docs/steps/README.md` | Integrator | Not edited by step chats. |

Generators run through `npm run gen` (STEP 01 builds them). Generated files carry the header `// GENERATED - do not edit. Source: <path>` and are committed.

## 2. Migration naming and ordering

`migrations/S{NN}_{seq3}_{description}.sql` and `migrations/S{NN}_{seq3}_{description}_down.sql`, for example `S09_004_invoices_core.sql`. Order = STEP number, then sequence. A STEP may reference tables of lower-numbered STEPs and of its own earlier migrations. A reference to a higher-numbered STEP goes through a contract, never a foreign key. Migrations are idempotent (`IF NOT EXISTS`) and have a rollback file. Table, index, constraint and enum names follow the master prompt conventions; names are prefixed by domain, so two STEPs never create the same table. Table ownership is listed in section 4.

## 3. Path ownership

| STEP | Owned paths |
|---|---|
| 01 | root configs, `.github/`, `.husky/`, `scripts/` (except `scripts/verify/stepNN-*`), `docker/`, `instrumentation.ts`, `app/layout.tsx`, `app/(*)/shell-preview` and `app/dev/` gallery pages, `lib/providers/{theme-provider,query-provider}.tsx`, `lib/hooks/`, `lib/entitlement/`, `stores/`, `schemas/common.ts`, `config/boot/s01-*`, `lib/container.ts`, `lib/errors/`, `lib/logger/`, `lib/env/` (loader), `lib/api/` (`withApi`), `lib/utils/`, `lib/i18n/` (loader, barrel), `types/contracts/`, `types/events.ts`, `styles/`, `components/ui/`, `components/layout/`, `components/shared/`, `config/` (framework files, `plans.ts`, `countries.ts`), route-group `layout.tsx` / `not-found.tsx` / `error.tsx` / `loading.tsx` files, `docs/execution/`, `docs/steps/README.md`, `docs/ADR/`, `docs/RUNBOOKS/` index, `supabase/`, README, CONTRIBUTING, SECURITY, CHANGELOG, LICENSE, `CLAUDE.md` |
| 02 | `lib/supabase/`, `lib/auth/{roles,permissions,approval-engine,approval-rules}.ts`, `lib/middleware/tenant.ts`, `lib/providers/presence-provider.tsx`, `lib/compliance/`, `services/{base,audit,approval,compliance,jobs,events}/`, `workers/runner.ts`, `cron/base/`, `app/api/{approvals,cron}/`, `app/api/admin/{audit,compliance}/`, `app/(admin)/admin/{approvals,audit,compliance}/`, `app/(dashboard)/approvals/`, `components/admin/{approvals,audit,compliance}/`, `migrations/S02_*`, `sql/assertions/s02_*` |
| 03 | `lib/auth/{two-factor,oauth,session,password,lock,step-up,impersonation}.ts`, `services/auth/`, `app/(auth)/`, `app/api/auth/`, `app/(dashboard)/account/security/`, `app/(admin)/admin/{account-locks,impersonation}/`, `app/api/admin/{account-locks,impersonation}/`, `emails/auth/`, `migrations/S03_*` |
| 04 | `middleware.ts`, `lib/security/`, `lib/middleware/{rate-limit,bot-detector,vpn-detector,csrf,auth,idempotency,headers}.ts`, `lib/auth/tokens.ts`, `lib/webhook/` (signature and dedupe helpers), `services/{security,fraud,incident,alerting,siem}/`, `app/(admin)/admin/{fraud,siem,incidents,alerts,health,security}/`, `app/api/{health,admin/security,admin/incidents,admin/alerts,admin/siem}/`, `sentry.*.config.ts`, `config/boot/s04-*`, `config/security.ts`, `docs/RUNBOOKS/security-*`, `migrations/S04_*` |
| 05 | `lib/storage/`, `lib/encryption/`, `lib/email/`, `services/{storage,email,notification}/`, `emails/` (base layout and shared templates), `app/api/{storage,email,notifications}/`, `app/(dashboard)/notifications/`, `app/(dashboard)/settings/{storage,email}/`, `app/(admin)/admin/{emails,storage}/`, `components/{email,notifications}/`, `migrations/S05_*` |
| 06 | `app/(public)/`, `lib/seo/`, `lib/analytics/`, `services/{cms,blog,seo,marketing,leads,abtest}/`, `app/(admin)/admin/{cms,blog,seo,analytics,marketing,leads}/`, `app/api/{public-site,cms,blog,leads,seo}/`, `app/sitemap.ts`, `app/robots.ts`, `components/marketing/`, `emails/marketing/`, `migrations/S06_*` |
| 07 | `app/(dashboard)/{onboarding,team}/`, `app/(dashboard)/settings/` (all except `storage`, `email`), `app/(dashboard)/support/`, `services/{company,team,kyc,domain,support,lifecycle}/`, `app/api/{companies,settings,team,kyc,support}/`, `app/(admin)/admin/{users,tenants,kyc,support,feature-flags,staff,setup}/`, `components/{onboarding,settings}/`, `emails/onboarding/`, `migrations/S07_*` |
| 08 | `app/(dashboard)/{clients,products,inventory,suppliers,purchase-orders,imports}/`, `services/{client,product,inventory,supplier,purchase,import,export}/`, `app/api/{clients,products,inventory,suppliers,purchase-orders,import,export}/`, `components/{client,inventory}/`, `migrations/S08_*` |
| 09 | `app/(dashboard)/{dashboard,invoices,estimates,projects,reports}/`, `services/{invoice,estimate,project,tax,fx,report}/`, `lib/pdf/` (engine, invoice, estimate, report), `pdf-templates/`, `app/api/{invoices,estimates,projects,reports,pdf}/`, `components/{invoice,pdf,charts}/`, `emails/invoice/`, `migrations/S09_*` |
| 10 | `lib/payment/` (`registry.ts`, `routing.ts`, `adapters/base.ts`, `card-rules.ts`, `verification.ts`, `credentials.ts`, `modes.ts`), `config/processors.ts`, `config/payment-risk.ts`, `services/payment/`, `app/(dashboard)/payments/`, `app/(admin)/admin/{processors,payments}/`, `app/api/{payments,payment-links,refunds}/`, `app/api/admin/{processors,payment-review}/`, `components/payment/` (core, checkout slot), `docs/processors/README.md` (generated), `migrations/S10_*` |
| 11 | `lib/payment/adapters/{stripe,paypal,braintree,square,authorizenet,bluesnap,verifone,payarc}.ts` (+ same-name folders), `app/api/webhooks/{stripe,paypal,braintree,square,authorizenet,bluesnap,verifone,payarc}/`, `components/payment/processors/{same ids}/`, `docs/processors/{same ids}.md` and `.verify.md` |
| 12 | `lib/payment/adapters/{nmi,adyen,paddle,fastspring,payproglobal,payoneer,rapyd,custom}.ts` (+ same-name folders), `app/api/webhooks/{same ids}/`, `components/payment/processors/{same ids}/`, `docs/processors/{same ids}.md` and `.verify.md` |
| 13 | `app/(client-portal)/`, `services/{portal,contract,esign,dispute,evidence,branding}/`, `lib/pdf/{receipt-pdf,evidence-pack-pdf}.tsx`, `app/(dashboard)/{disputes,contracts}/`, `app/(admin)/admin/disputes/`, `app/api/{portal,contracts,disputes}/`, `components/client/`, `emails/client/`, `migrations/S13_*` |
| 14 | `lib/payment/{wallet,payout,mor-engine,fee-calculator}.ts`, `services/{wallet,mor,payout,subscription,entitlement,coupon,plan,bnpl}/`, `config/payment-methods.ts`, `app/(dashboard)/{wallet,subscriptions}/`, `app/(admin)/admin/{plans,coupons,payouts,revenue,subscriptions}/`, `app/api/{wallet,subscriptions,payouts,plans,coupons}/`, `emails/billing/`, `migrations/S14_*` |
| 15 | `app/(dashboard)/{accounting,payroll,expenses,hr}/`, `app/(client-portal)/p/[token]/` (employee portal), `services/{accounting,payroll,hr,expense,reconciliation,asset,budget,taxfiling}/`, `lib/pdf/payslip-pdf.tsx`, `app/api/{accounting,payroll,hr,expenses}/`, `components/{accounting,payroll}/`, `emails/payroll/`, `migrations/S15_*` |
| 16 | `lib/{whatsapp,social,integrations,ocr}/`, `services/{whatsapp,social,publicapi,webhookout,integration,bankfeed,ocr,messaging,migration}/`, `app/api/{public/v1,whatsapp,social,integrations,webhooks/{shopify,woocommerce,whatsapp}}/`, `app/(dashboard)/{integrations,whatsapp,social,developers,migration}/`, `app/(admin)/admin/{whatsapp,social}/`, `emails/integrations/`, `workers/integrations/`, `migrations/S16_*` |

If a path you need is not listed, it is not yours. Write `BLOCKERS.md`.

## 4. Table ownership (no two STEPs create the same table)

- 02: companies, profiles, memberships, roles, role_permissions, approval_rules, approval_requests, approval_steps, approval_delegations, audit_logs, audit_checkpoints, domain_events, job_queue, api_idempotency, feature_flags, consent_records_platform, dsar_requests, retention_policies, data_classifications
- 03: auth_login_state, auth_login_events, auth_unlock_requests, password_history, two_factor_factors, backup_codes, user_sessions, user_devices, oauth_identities, impersonation_sessions
- 04: rate_limits, ip_blocks, ip_reputation, security_events, fraud_signals, risk_scores, device_fingerprints, access_tokens, token_events, siem_destinations, alert_rules, alerts, incidents, incident_events, on_call_rosters
- 05: files, file_access_logs, quarantined_files, storage_connections, storage_migrations, email_queue, email_logs, email_templates, email_suppressions, smtp_configs, notifications, notification_prefs
- 06: cms_pages, cms_blocks, blog_posts, blog_categories, seo_settings, ab_tests, ab_variants, campaigns, leads, testimonials, analytics_settings
- 07: kyc_submissions, kyc_documents, invitations, company_settings, company_branding, company_domains, support_tickets, support_messages, feedback_entries
- 08: clients, client_contacts, products, product_variants, warehouses, stock_levels, stock_movements, suppliers, purchase_orders, supplier_bills, import_jobs
- 09: invoices, invoice_items, invoice_sequences, invoice_snapshots, estimates, credit_notes, recurring_schedules, installment_plans, late_fee_rules, projects, time_entries, tax_rates, fx_rates
- 10: processors, processor_credentials, processor_modes, processor_mode_tests, routing_rules, payments, payment_attempts, payment_allocations, refunds, payment_links, webhook_events, card_identities, card_blacklist, payment_reviews
- 13: contracts, signatures, disputes, dispute_evidence, evidence_packs, delivery_proofs, consent_records, portal_events
- 14: wallets, wallet_ledger_entries, holds, payouts, payout_methods, settlements, plans, plan_entitlements, subscriptions, coupons, coupon_redemptions, client_subscriptions, bnpl_offers
- 15: accounts, journal_entries, journal_lines, fiscal_periods, bank_accounts, bank_transactions, reconciliations, fixed_assets, budgets, expenses, receipts, employees, salary_structures, pay_runs, payslips, leave_requests, leave_balances
- 16: api_keys, webhook_endpoints, webhook_deliveries, integrations, whatsapp_templates, whatsapp_messages, social_accounts, social_posts, bank_feed_connections, ocr_jobs, migration_jobs

## 5. Duplicate prevention rules

1. Before creating any file, search the repo for an existing file with the same purpose. If it exists in another STEP's paths, use its contract instead.
2. A helper used by two STEPs lives in STEP 01 (`lib/utils/`, `components/shared/`). If it is missing, record it in `BLOCKERS.md`; do not create a local copy.
3. Names are domain-prefixed (`invoice-card.tsx`, `payment-service.ts`). Never create a generic `utils.ts` or `helpers.ts`.
4. Each constant (limits, defaults, thresholds) has one home in `config/`. Do not repeat numbers in code.
5. Each user-facing string has one key in `lib/i18n/strings/en/<domain>.ts`.

## 6. Fragment naming (every fragment file is prefixed with its STEP number `sNN-`)

| Fragment | Path pattern | Generated barrel |
|---|---|---|
| UI strings | `lib/i18n/strings/en/sNN-<name>.ts` (exports `strings`) | `lib/i18n/strings/en.ts` |
| Navigation | `config/nav/sNN.ts` (exports `nav`) | `config/nav-map.ts` |
| Permissions | `config/permissions/sNN-<name>.ts` (exports `permissions`) | `config/permissions.ts` |
| Approval rules | `config/approval/sNN-<name>.ts` (exports `approvalRules`) | `config/approval-rules.generated.ts` |
| Environment names | `config/env/sNN.env.fragment` | `.env.example` |
| Environment schema | `lib/env/sNN.ts` (exports `serverShape`, `publicShape`) | `lib/env/schema.generated.ts` |
| Cron jobs | `cron/jobs/sNN-<job>.ts` (exports `job`) | `cron/schedule.generated.ts` |
| Middleware modules | `config/middleware/sNN.ts` (exports `entry`) | `lib/middleware/chain.generated.ts` |
| Boot hooks | `config/boot/sNN-<name>.ts` (exports `boot`) | `lib/boot.generated.ts` |
| Service registration | `services/<domain>/register.ts` (default export `register`) | `lib/bootstrap.generated.ts` |
| Payment adapters | `lib/payment/adapters/<id>.ts` (exports `adapter`) | `lib/payment/adapters/index.generated.ts` |
| Design tokens | `config/design-tokens.json` | `styles/tokens.generated.css`, `public/design-tokens.json` |

A file whose name starts with `sNN-` belongs to STEP NN wherever it lives. This rule decides ownership inside shared directories.

## 7. Route namespace rules

1. Route groups share one URL space. Admin pages live under the real prefix `/admin` (`app/(admin)/admin/<page>`). The dashboard home is `/dashboard` (`app/(dashboard)/dashboard`). The public home is `/`.
2. Dashboard pages use root-level paths. The names `invoices, estimates, clients, products, inventory, suppliers, purchase-orders, payments, wallet, subscriptions, projects, expenses, accounting, payroll, hr, reports, settings, notifications, support, approvals, disputes, contracts, integrations, whatsapp, social, developers, migration, team, onboarding, imports, account, dashboard` are reserved for the dashboard. Public pages must not use them.
3. Auth pages use `/login, /signup, /forgot-password, /reset-password, /verify-email, /2fa`. Portal pages use `/i, /pay, /e, /r, /hub, /c, /p, /expired`. Both lists are reserved.

## 8. Conflict resolution inside the table

When a file matches more than one STEP, the more specific pattern wins (more literal characters). `config/ownership.json` is the machine-readable copy of this map used by `scripts/check-ownership.sh`.
