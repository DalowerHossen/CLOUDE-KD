# STEP 14 - Handoff: wallet, merchant of record, payouts, plans, subscriptions, coupons, installments, revenue reports

Branch `claude/clever-goldberg-8ncdae`. Sub-steps 14.1 to 14.10 are done (PROGRESS.md). Decisions D1 to D21 are in DECISIONS.md, requests R1 to R14 in DEPENDENCY_REQUESTS.md, verification in VERIFY.md.

## What this STEP provides
**Owner pages**: `/wallet` (balance, holds, threshold), `/wallet/ledger`, `/wallet/payouts`, `/wallet/methods`, `/wallet/payment-settings`, `/wallet/bnpl` (installments), `/subscriptions` (client subscriptions), `/subscriptions/plans`, `/subscriptions/[id]`, `/subscriptions/billing` (the company's own platform plan and invoices).
**Platform team pages**: `/admin/payouts` (queue), `/admin/payouts/settings`, `/admin/payouts/methods`, `/admin/plans`, `/admin/subscriptions` (+ `/settings`), `/admin/coupons`, `/admin/bnpl`, `/admin/revenue`.

## Contracts registered
- `wallet` (`services/wallet/register.ts`): ledger-backed balances, credit, debit, hold and release.
- `entitlement` (`services/entitlement/register.ts`, `override: true`): database-backed plan values over the built-in catalogue; usage meters, `assertWithinLimit`, `paywall`.
- MoR settlement hooks (`services/mor/register.ts`) and the event worker `settle-payment`.
Contracts used from other STEPs: `payments`, `invoices` (through the invoice services), `fx`, `kyc`, `encryption`, `approval`, `notification`, `events`, `audit`, `permissions`.

## Ledger account codes
Company accounts (one wallet per company): `available`, `held`. Platform accounts: `processor_receivable`, `platform_fee_revenue`, `processor_fee_expense`, `payout_in_transit`, `clearing`. Every posting has legs that add up to zero (2 to 12 legs); keys make a posting happen once. Money is `numeric(18,4)` USD only.

## Plan keys
`free`, `pro`, `business`, `enterprise` (slug of the database `plans` table; the slug never changes). Entitlement keys include `invoices.monthly`, `clients.max`, `staff.seats`, `storage.gb`, `projects.enabled`, `whitelabel`, `custom_domain`. Paid plan prices start at 0 and hidden until the platform team sets them.

## Payout states
`requested` -> `pending_approval` (large payout, or staff request) -> `approved` -> `processing` -> `paid`; side exits: `failed` (money back), `cancelled` (money back), `reversed` (after paid, by the super admin). Retry after 1, 6 and 24 hours (4 attempts). Large payout: 5,000 USD or more (CEO approval).
Other states: subscription `incomplete | trialing | active | past_due | grace | ended`; client subscription `trialing | active | paused | past_due | cancelled | ended`; platform invoice `open | paid | void | uncollectible`; settlement item `pending | held | released | direct | reversed | charged_back`; installment plan `active | completed | defaulted | cancelled`.

## Events
Published: `payout.requested`, `subscription.created`, `subscription.renewed`, `subscription.cancelled`; notifications to owners and the platform team for `wallet.low`, `wallet.negative`, payouts, subscription notices, installments (`bnpl.accepted`, `bnpl.completed`, `bnpl.defaulted`).
Consumed (workers `workers/s14/`): `payment.captured` -> `settle-payment` (settlement into the wallet, hold, reserve); `invoice.paid` -> `platform-invoice-paid` (R12 hook); `payment.refunded` -> `bnpl-refund` (plan history).

## Cron (UTC)
`wallet-holds` `5 * * * *` (release holds, reports), `payouts` `20 * * * *` (scheduled payouts, retries), `subscriptions` `35 * * * *` (renewal invoices, reminders, dunning, grace), `client-billing` `50 * * * *` (client subscription cycles), `plan-usage` `40 2 * * *` (monthly usage record), `bnpl-check` `20 6 * * *` (installment plans).

## Database (migrations S14_001 to S14_009, each with `_down` and an assertion in `sql/assertions/`)
Ledger and wallets (001); `mor_settings`, `settlements`, `settlement_items` (002); payout methods, schedules, settings, payouts, events (003); `payment_method_settings` (004); `plans`, `plan_entitlements`, `plan_history`, `usage_counters`, `kd_usage_add` (005); `billing_settings`, `platform_subscriptions`, `platform_invoices` (+ items, counters), `subscription_events` (006); `coupons`, `coupon_redemptions`, `kd_coupon_redeem` (007); `client_subscription_plans`, `client_subscriptions`, `client_billing_runs`, `client_subscription_events` (008); `bnpl_settings`, `bnpl_plans`, `bnpl_events` (009). History tables are append only. All have row level security with default deny.

## Permissions, approvals, navigation, strings
Fragments: `config/permissions/s14-payouts.ts` (wallet, payout, plans, subscriptions, coupons, client subscriptions), `config/approval/s14-wallet.ts`, `config/nav/s14.ts`, `lib/i18n/strings/en/s14-wallet.ts` (namespace `s14Wallet`). Installments and client subscriptions share `client_subscription.read` and `client_subscription.manage`.

## Revenue reports (14.10)
`services/subscription/analytics.ts`: MRR (a yearly plan per month), ARR, revenue per company, churn, lifetime value, monthly cohort retention, net revenue retention, revenue by plan and by country (tax excluded), merchant-of-record against direct payments, chargebacks, payouts by state and failure rate, and a health score per paying company. API `GET /api/subscriptions/analytics?from=&to=`; page `/admin/revenue`. Coupon impact is in `/admin/coupons`; installment figures are in `/admin/bnpl`.

## For the Integrator
1. Merge requests R1 to R14 (DEPENDENCY_REQUESTS.md). The important ones: R3 (stored methods, recurring charges, payouts in the adapter contract), R2 (settlement gate), R12 (online payment of platform invoices), R10 (limit checks at the creation points), R14 (installments on the client payment page), R6 and R7 (regenerate the barrels).
2. `npm run gen` was run and the cron and worker barrels are committed; the nav-map and permissions barrels stay stale on purpose (D2, R6): regenerate after the merge.
3. Environment: no new variables.

## Known gaps (also in the decisions)
- Not built because the contract lacks it: charging a stored card automatically (dunning attempts are notices), live payout partners (only the manual bank partner), a live installment partner that takes the risk, online card payment of platform invoices (bank transfer works; the hooks wait for R12), the client's own pause and cancel on the portal (R13), installments chosen by the client on the payment page (R14).
- Not built: referral credit codes, feature flags per tenant and percentage rollouts, partner reconciliation and quota monitor, drawing the QR on invoices, a PDF of platform invoices, the merchant agreement e-sign and its legal pages.
- The health score uses payout failures, chargebacks and plan status; overdue invoices, plan usage and days since the last invoice are not read yet (neutral values).
- Fee of an installment plan is recorded and reported; collecting it from the seller wallet at settlement is not wired.
- Not run in this environment (recorded for the sandbox run): services against live PostgREST, pages in a browser (320 px, dark mode), emails, approval flows end to end, event workers with real events, a real invoice for a subscription cycle, a real settlement with a processor.
