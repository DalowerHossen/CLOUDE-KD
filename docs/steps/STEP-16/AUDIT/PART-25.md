<!-- path: docs/steps/STEP-16/AUDIT/PART-25.md -->
# Audit part 25 of 41: features 2377 to 2475

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 39, some-match 36, generic-match 8, no-match 1, manual 15. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 2377 | A2 | admin forced | some-match | 07 | services/compliance/sanctions.ts |
| 2378 | A2 | 2FA admin forced | some-match | 07 | services/compliance/sanctions.ts |
| 2379 | A2 | admin override | some-match | 07 | services/invoice/invoices.ts |
| 2380 | A2 | admin override | some-match | 07 | services/invoice/invoices.ts |
| 2381 | A2 | internal admin only | some-match | 07 | services/payroll/runs.ts |
| 2382 | A2 | all actions | some-match | 07 | app/api/plans/usage/route.ts |
| 2383 | A2 | IP device timestamp | match | 07 | scripts/verify/step04-core.ts |
| 2384 | A3 | login as owner | some-match | 03,07 | scripts/verify/step16-tenant-insight.ts |
| 2385 | A3 | visible warning You are impersonating X | match | 03,07 | app/(dashboard)/subscriptions/billing/page.tsx |
| 2386 | A3 | max 1 hour auto-logout | generic-match | 03,07 | services/payroll/run-rules.ts |
| 2387 | A3 | read-only by default | some-match | 03,07 | services/payroll/register.ts |
| 2388 | A3 | explicit toggle logged | generic-match | 03,07 | scripts/verify/step06-core.ts |
| 2389 | A3 | owner notification | some-match | 03,07 | scripts/verify/step11-verifone.ts |
| 2390 | A3 | who when what accessed | some-match | 03,07 | services/payroll/runs.ts |
| 2391 | A3 | one-click return to admin | some-match | 03,07 | lib/middleware/bot-detector.ts |
| 2392 | A4 | all companies search/filter | match | 07 | services/export/exports.ts |
| 2393 | A4 | profile plan usage billing | match | 07 | services/wallet/owner-mail.ts |
| 2394 | A4 | upgrade/downgrade admin | match | 07 | scripts/verify/step14-client-subscriptions.ts |
| 2395 | A4 | per tenant | manual | 07 | - |
| 2396 | A4 | Google Drive | match | 07 | migrations/S05_003_storage_adapters.sql |
| 2397 | A4 | API usage | some-match | 07 | config/s16-api.ts |
| 2398 | A4 | usage | some-match | 07 | config/s16-api.ts |
| 2399 | A4 | engagement payment support | some-match | 07 | migrations/S05_006_email.sql |
| 2400 | A4 | login drop payment delay | match | 07 | scripts/verify/step16-tenant-insight.ts |
| 2401 | A4 | internal | some-match | 07 | services/payroll/runs.ts |
| 2402 | A4 | (Bengali only) | manual | 07 | - |
| 2403 | A4 | support purposes | some-match | 07 | lib/domain/hostnames.ts |
| 2404 | A4 | point-in-time one company | some-match | 07 | scripts/verify/step11-verifone.ts |
| 2405 | A4 | all data admin only | manual | 07 | - |
| 2406 | A5 | announcement dismissible | some-match | 07 | migrations/S07_008_admin_ops_down.sql |
| 2407 | A5 | start/end date | some-match | 07 | services/payroll/run-rules.ts |
| 2408 | A5 | all/specific plans/specific tenants | some-match | 07 | scripts/verify/step16-modules.ts |
| 2409 | A5 | (Bengali only) | manual | 07 | - |
| 2410 | A5 | (Bengali only) | manual | 07 | - |
| 2411 | A5 | (Bengali only) | manual | 07 | - |
| 2412 | A5 | (Bengali only) | manual | 07 | - |
| 2413 | A5 | incident communication all tenants | generic-match | 07 | services/incident/incident-service.ts |
| 2414 | A5 | admin tenant | manual | 07 | - |
| 2415 | B1 | name slug price features | match | 14 | app/(dashboard)/subscriptions/billing/page.tsx |
| 2416 | B1 | coercion fix no data loss | match | 14 | lib/i18n/strings/en/s15-accounting.ts |
| 2417 | B1 | hide from new signups | match | 14 | lib/i18n/strings/en/s03-auth.ts |
| 2418 | B1 | free/starter/pro/enterprise | match | 14 | lib/i18n/strings/en/s07-company.ts |
| 2419 | B1 | monthly/annual per seat | match | 14 | lib/i18n/strings/en/s07-company.ts |
| 2420 | B1 | entitlement mapping | generic-match | 14 | config/storage.ts |
| 2421 | B1 | invoices/clients/staff/storage/API | some-match | 14 | scripts/verify/step16-automation.ts |
| 2422 | B1 | configurable default 14 days | some-match | 14 | services/payroll/run-rules.ts |
| 2423 | B1 | show/hide on pricing page | match | 14 | lib/cms/defaults/legal.ts |
| 2424 | B1 | pricing page display | some-match | 14 | app/api/plans/route.ts |
| 2425 | B1 | Most Popular Best Value | generic-match | 14 | lib/i18n/strings/en/s14-wallet.ts |
| 2426 | B1 | move tenants between plans bulk | match | 14 | lib/i18n/strings/en/s13-portal.ts |
| 2427 | B1 | changes log | match | 14 | services/payroll/runs.ts |
| 2428 | B2 | all tenants filter by plan/status | some-match | 14 | services/payroll/run-rules.ts |
| 2429 | B2 | sync plan change proration | match | 14 | app/api/integrations/bank/connections/[id]/sync/route.ts |
| 2430 | B2 | prorated immediate | generic-match | 14 | scripts/verify/step14-client-subscriptions.ts |
| 2431 | B2 | end of cycle | some-match | 14 | app/(dashboard)/subscriptions/page.tsx |
| 2432 | B2 | end of cycle reason capture | match | 14 | scripts/verify/step16-processor-health.ts |
| 2433 | B2 | cancelled active | match | 14 | services/payout/payouts.ts |
| 2434 | B2 | daily proration | match | 14 | lib/payment/subscription-rules.ts |
| 2435 | B2 | Never-lock data never deleted | match | 14 | services/wallet/ledger.ts |
| 2436 | B2 | Free cron | match | 14 | cron/jobs/s14-subscriptions.ts |
| 2437 | B2 | dunning 3 attempts configurable | match | 14 | config/s14-subscriptions.ts |
| 2438 | B2 | 7d 3d 1d before | manual | 14 | - |
| 2439 | B2 | auto | manual | 14 | - |
| 2440 | B2 | SaaS VAT auto per jurisdiction | match | 14 | lib/i18n/strings/en/s15-accounting.ts |
| 2441 | B3 | code type value expiry | some-match | 14 | scripts/verify/step12-nmi.ts |
| 2442 | B3 | (Bengali only) | manual | 14 | - |
| 2443 | B3 | percentage/fixed amount/free trial | match | 14 | scripts/verify/step08-core.ts |
| 2444 | B3 | e.g. 20 off 10 off | some-match | 14 | scripts/verify/step16-settlement.ts |
| 2445 | B3 | (Bengali only) | manual | 14 | - |
| 2446 | B3 | total uses per-user uses | some-match | 14 | services/payroll/run-rules.ts |
| 2447 | B3 | specific plans only | some-match | 14 | scripts/verify/step16-modules.ts |
| 2448 | B3 | checkout integration | match | 14 | lib/payment/adapters/payproglobal.ts |
| 2449 | B3 | (Bengali only) | manual | 14 | - |
| 2450 | B3 | revenue impact | match | 14 | lib/i18n/strings/en/s14-wallet.ts |
| 2451 | B3 | per coupon per period | match | 14 | app/(dashboard)/subscriptions/billing/page.tsx |
| 2452 | C1 | CMS WYSIWYG all public pages | some-match | 06 | app/robots.ts |
| 2453 | C1 | CMS all editable pages | generic-match | 06 | app/robots.ts |
| 2454 | C1 | CMS rich text images links | match | 06 | lib/cms/blocks.ts |
| 2455 | C1 | CMS hero features testimonials CTA FAQ | match | 06 | lib/cms/templates.ts |
| 2456 | C1 | CMS | some-match | 06 | app/robots.ts |
| 2457 | C1 | CMS Google Drive | match | 06 | lib/cms/defaults/help.ts |
| 2458 | C1 | CMS SEO per page title description OG | match | 06 | app/(admin)/admin/blog/_components/post-editor.tsx |
| 2459 | C1 | CMS URL path | match | 06 | app/robots.ts |
| 2460 | C1 | CMS 301 | some-match | 06 | app/robots.ts |
| 2461 | C1 | CMS before publish | match | 06 | sql/assertions/s06_002_cms.sql |
| 2462 | C1 | CMS | some-match | 06 | app/robots.ts |
| 2463 | C1 | CMS history rollback | match | 06 | lib/cms/defaults/help.ts |
| 2464 | C1 | CMS publish at future date | match | 06 | sql/assertions/s06_002_cms.sql |
| 2465 | C1 | CMS header footer social links | match | 06 | lib/cms/defaults/legal.ts |
| 2466 | C2 | rich text | some-match | 06 | scripts/verify/step06-core.ts |
| 2467 | C2 | (Bengali only) | manual | 06 | - |
| 2468 | C2 | (Bengali only) | manual | 06 | - |
| 2469 | C2 | Google Drive | match | 06 | migrations/S05_003_storage_adapters.sql |
| 2470 | C2 | SEO title description OG image | match | 06 | app/(public)/blog/[slug]/page.tsx |
| 2471 | C2 | CRUD | no-match | 06 | - |
| 2472 | C2 | name bio avatar | match | 06 | services/blog/admin.ts |
| 2473 | C2 | before publish | some-match | 06 | services/payroll/runs.ts |
| 2474 | C2 | edit history | some-match | 06 | app/(dashboard)/contracts/[id]/page.tsx |
| 2475 | C2 | pin to top | generic-match | 06 | sql/assertions/s16_013_social_networks.sql |
