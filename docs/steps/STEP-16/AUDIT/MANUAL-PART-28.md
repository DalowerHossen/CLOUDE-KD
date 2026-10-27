<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-28.md -->
# Manual reading, part 28 (features 2674 to 2772, the lines that are Bengali only)

Read against the code and the STEP 14 and 16 notes on 2026-10-27; nothing was opened in a browser. STEP 14 records as not built: feature flags per tenant with percentage rollouts.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 2681 | Feature flags per plan, per tenant and per user | partial | `services/company/flags.ts`, `/api/companies/admin/flags` (per company); STEP 14: percentage rollouts not built; no per-user flag was found |
| 2682 | Feature flag management screen (admin) | present | `app/(admin)/admin/feature-flags` |
| 2698 | Sub-processor list, auto-updated | partial | the legal page `sub-processors` is an edited text, not generated from the integrations |
| 2715 | MoR responsibility disclosure page | check in browser | a legal page for it was not found in the defaults |
| 2722 | Cookie consent proof kept | present | `/api/public-site/consent` |
| 2723 | Cookie-free analytics option | check in browser | `/api/public-site/hit` stores a counter only (STEP 06 D16) |
| 2729 | Revenue growth rate (MoM, YoY) | present | `app/(admin)/admin/revenue`, `services/subscription/analytics.ts` |
| 2732 | Platform fee income report | present | the same |
| 2734 | Payout volume report | check in browser | `app/(admin)/admin/payouts` |
| 2735 | Chargeback rate report | check in browser | `app/(admin)/admin/disputes` |
| 2741 | Upgrade and downgrade report | present | `/api/subscriptions/analytics`, retention page (16.27) |
| 2742 | Coupon impact report | present | `/api/coupons/report` |
| 2743 | Success rate per gateway | check in browser | processor health board |
| 2744 | Tenant data export for support | present | 16.24, `/api/admin/system/tenant-export` |
| 2745 | Platform health dashboard, all services | present | `lib/admin/health-score.ts`, `/admin/system` |
| 2751 | E-mail delivery rate | check in browser | outbox statuses; no rate figure seen |
| 2753 | Webhook delivery rate | check in browser | `webhook_deliveries` |
| 2762 | Config and secret management screen (admin) | present | 16.22, `/admin/system/config` |
| 2763 | Feature flag management per plan, tenant and user | partial | see 2681 |
| 2766 | Rate limit override per tenant | present | 16.22, per-company cap in the platform controls |

## Partly built: 2681, 2698, 2763. Everything else needs a browser to confirm.
