# STEP 14 - Sub-steps plan

Branch: `claude/clever-goldberg-8ncdae`, continued from the end of STEP 13 (STEPS 02 to 13 are not on `origin/integration` yet, so the branch is the only place where the contracts this STEP uses exist). Migration block `S14_*`. Every sub-step ends with lint, typecheck, `scripts/check-all.sh`, `scripts/db-apply.sh --clean` (when it has a migration), `scripts/run-assertions.sh s14` and its own `scripts/verify/step14-*.ts`. FEATURE_LIST ranges: Part 4 1623-1668, 1786-1868, 1933-1972; Part 2 870-934; Part 7 2882-2923, 3180-3202, 3240-3275; Part 9 4140-4180, 4203-4239. Each sub-step reads its exact lines first.

Security checks for all sub-steps: Z1 to Z14 of STEP_PROTOCOL section 6. Ledger rows are insert-only; the balance is the sum of the ledger; a wallet is read and written only through the `wallet` contract (and the services of this STEP behind it); money only through `Money`; payout creation needs step-up and the approval chain; rule 18 (no payment brand names) is checked in code, strings and these documents.

Contracts consumed (all present in `types/contracts/`): payments, invoices, kyc, approval, encryption, email, notification, audit, events, fx, locks, jobs, permissions, tenant, auth, security. Provided: `wallet` (registered by `services/wallet/register.ts`) and `entitlement` (database-backed, registered over the config base with `override: true` by `services/entitlement/register.ts`).

What the earlier STEPs leave out (found while planning, see DECISIONS.md D3): no payment adapter supports stored payment methods, recurring charges or payouts (`supportsRecurring` and `supportsPayout` are false everywhere, and the adapter contract has no operation for them). 14.3 and 14.8 therefore build the framework, the state machines and the manual paths that need no vendor API, and record the live partner calls as a request that needs the partner's official documentation (rule 8).

## 14.1 Ledger and wallet
- Goal: wallets (one per company), a double-entry ledger (insert only, grouped in postings that sum to zero), holds, balance = ledger sum, serializable posting function with an idempotency key, the `wallet` contract (`credit`, `debit`, `hold`, `release`), the fee calculator (platform fee: percent plus fixed per processor, flat, percent or tiered, per-merchant override), low and negative balance alerts, CSV export and monthly statement PDF.
- Files: `migrations/S14_001_wallet_ledger.sql` (+ `_down`; `wallets`, `ledger_entries`, `wallet_holds`, `kd_wallet_post`), `sql/assertions/s14_001_wallet_ledger.sql`, `lib/payment/{wallet,fee-calculator}.ts`, `services/wallet/{ledger,wallet-service,statement,register}.ts`, `scripts/verify/step14-ledger.ts`.
- FEATURE_LIST: 1475-1478, 1481, 1482, 1483-1485, 1489 (1479, 1480 in 14.3 with the owner page).
- Done when: the ledger sum equals the balance after every operation (assertion); two parallel debits cannot overdraw (script); a repeated posting with the same key changes nothing; ledger rows cannot be updated or deleted.

## 14.2 Settlement and merchant-of-record engine
- Goal: from a captured payment to a wallet credit (net of the fee), hold periods (new merchant longer), reserve, risk-based hold extension, release job, KYC-gated mode per company (`mor`, `direct`, `suspended`), platform and per-company toggles, settlement cycle and reports, hold reasons shown to the owner, and the gate STEP 10 asks before taking a payment.
- Files: `migrations/S14_002_settlement.sql` (+ `_down`; `mor_settings`, `settlements`, `settlement_items`), `sql/assertions/s14_002_settlement.sql`, `lib/payment/mor-engine.ts`, `services/mor/{settle,holds,mode,reports,register}.ts`, `workers/s14/settle-payment.event.ts`, `cron/jobs/s14-holds.ts`, `scripts/verify/step14-settlement.ts`.
- FEATURE_LIST: 1490-1496, 1511-1528, 1530-1532 (rule-based risk), 1536-1537, 1541.
- Done when: a seeded `payment.captured` credits the wallet once (replay changes nothing); no KYC means no settlement and a clear gate answer; hold release moves held to available; a refund reverses the credit.

## 14.3 Payouts (split: a data and services, b pages and APIs)
- 14.3.a Goal: payout methods (Global Payout Partners framework with generic labels; a partner adapter interface of this STEP; the manual partner that needs no vendor API), payout requests with approval level by amount, step-up, minimum, period limit, fee, FX at request (rate frozen with the `fx` contract), states `requested`, `pending_approval`, `approved`, `processing`, `paid`, `failed`, `cancelled`, `reversed`, automatic credit back on failure, retry schedule, schedules (daily, weekly, monthly), events `payout.requested|approved|paid|failed`.
  Files: `migrations/S14_003_payouts.sql` (+ `_down`; `payout_methods`, `payout_schedules`, `payouts`, `payout_events`), `sql/assertions/s14_003_payouts.sql`, `lib/payment/payout.ts`, `services/payout/{methods,payouts,partners,schedule,register}.ts`, `config/approval/s14-wallet.ts`, `cron/jobs/s14-payouts.ts`, `scripts/verify/step14-payouts.ts`.
  FEATURE_LIST: 1497-1510, 1338, 1369-1375.
  Done when: payout blocked without KYC; parallel payout requests cannot overdraw; a large payout waits for four eyes; a failed payout credits back once.
- 14.3.b Goal: owner wallet pages (balance available and held, ledger, statement, payout request, methods) and admin payout queue.
  Files: `app/(dashboard)/wallet/**`, `app/(admin)/admin/payouts/**`, `app/api/{wallet,payouts}/**`, `emails/billing/payout-*.tsx`, `config/{nav,permissions}/s14-*.ts` entries.
  FEATURE_LIST: 1479, 1480, 1495, 1507.

## 14.4 Local payment methods catalogue and tenant payment settings
- Goal: `config/payment-methods.ts` (internal codes, generic display labels only), per-country method catalogue with enable by the platform team and by plan, order, fee and client instructions; tenant payment settings page where the owner chooses among what the platform enabled and the plan allows (no API keys).
- Files: `config/payment-methods.ts`, `migrations/S14_004_payment_methods.sql` (+ `_down`; `payment_method_settings`), `sql/assertions/s14_004_payment_methods.sql`, `services/payout/payment-methods.ts`, `app/(dashboard)/wallet/payment-settings/**`, `app/(admin)/admin/payouts/methods/**`, `scripts/verify/step14-methods.ts`.
- FEATURE_LIST: 1339-1346, 1376, 747-751, 3522-3524 (generic names only).
- Done when: the guard finds no brand name; a method not enabled by the platform cannot be enabled by an owner; the plan limit is enforced on the server.

## 14.5 Plans and entitlements
- Goal: plan CRUD for the platform team (slug, prices monthly and yearly, limits, feature matrix, trial days, visibility, order, badge, archive, bulk migration, history), the database-backed `entitlement` service registered over the config base, usage meters and overage rules, upgrade and downgrade rules (never lock data), soft paywall data for the UI.
- Files: `migrations/S14_005_plans.sql` (+ `_down`; `plans`, `plan_entitlements`, `plan_history`, `usage_counters`), `sql/assertions/s14_005_plans.sql`, `services/plan/{plans,migrate}.ts`, `services/entitlement/{entitlement,usage,register}.ts`, `app/(admin)/admin/plans/**`, `app/api/plans/**`, `scripts/verify/step14-plans.ts`.
- FEATURE_LIST: 697-705, 725-732, 2415-2427, 2673-2680, 2684-2688, 2691.
- Done when: a plan change updates what `has` and `limit` answer at once; archived plans are hidden from sign-up but keep their tenants; the config base is used when the database has no plan.

## 14.6 Platform subscriptions
- Goal: owners subscribe and pay the platform, trials, proration, dunning (3 attempts) and grace, cancel at the end of the cycle, reactivate, trial to free, renewal reminders (7, 3, 1 days), platform invoices and receipts, admin list and edit.
- Files: `migrations/S14_006_subscriptions.sql` (+ `_down`), `sql/assertions/s14_006_subscriptions.sql`, `services/subscription/{platform,proration,dunning,invoices,register}.ts`, `emails/billing/*.tsx`, `app/(admin)/admin/subscriptions/**`, `app/(dashboard)/subscriptions/billing/**`, `cron/jobs/s14-subscriptions.ts`, `scripts/verify/step14-subscriptions.ts`.
- FEATURE_LIST: 706-716, 2428-2440 (the tax line of 2440 uses the tax rates of STEP 09 where they exist).
- Open design point resolved at the start of 14.6 (D6): how a platform invoice is paid through the payments contract, which takes an invoice id of a company.
- Done when: proration maths is checked; three failed charges end in the grace state and then the free plan without deleting data.

## 14.7 Coupons
- Goal: coupon CRUD (percent, fixed, free trial), code (custom or generated), expiry, total and per-company limits, plan restriction, one-time policy, redemption at subscription checkout, referral credit codes (no affiliate role), fraud guard, impact and usage reports.
- Files: `migrations/S14_007_coupons.sql` (+ `_down`; `coupons`, `coupon_redemptions`), `sql/assertions/s14_007_coupons.sql`, `services/coupon/{coupons,redeem,reports}.ts`, `app/(admin)/admin/coupons/**`, `app/api/coupons/**`, `scripts/verify/step14-coupons.ts`.
- FEATURE_LIST: 717-724, 2441-2451.
- Done when: a coupon second use is refused; parallel redemptions cannot exceed the limit.

## 14.8 Client subscriptions (split: a plans and schedules, b recurring runs)
- 14.8.a Goal: owner-defined subscription plans for their clients (name, price, frequency, features, trial, tiers), client subscriptions with start, pause, resume, cancel, upgrade and downgrade with proration, renewal reminders; tenant pages.
- 14.8.b Goal: the billing run that makes and sends the invoice of each cycle (through the invoice service of STEP 09), failed-payment retries and notices; automatic charging of a stored method only where an adapter supports it (see D3), otherwise the client pays the invoice link.
- Files: `migrations/S14_008_client_subscriptions.sql` (+ `_down`; `client_subscription_plans`, `client_subscriptions`, `client_subscription_events`), `sql/assertions/s14_008_client_subscriptions.sql`, `services/subscription/{client-plans,client-subscriptions,client-billing}.ts`, `app/(dashboard)/subscriptions/**`, `app/api/subscriptions/**`, `cron/jobs/s14-client-billing.ts`, `scripts/verify/step14-client-subscriptions.ts`.
- FEATURE_LIST: 1601-1620.

## 14.9 BNPL framework
- Goal: eligibility rules, offer display data for the checkout (3, 6, 12 installments, equal amounts, fee or no fee), installment tracking, missed-payment handling, refund hooks and reports. The partner call itself waits for a partner's official documentation (rule 8); the framework and the partner-less in-house installment view are built.
- Files: `migrations/S14_009_bnpl.sql` (+ `_down`), `sql/assertions/s14_009_bnpl.sql`, `services/bnpl/{offers,eligibility,installments,reports,partners}.ts`, `scripts/verify/step14-bnpl.ts`.
- FEATURE_LIST: 1621-1632.

## 14.10 Revenue analytics and closure
- Goal: MRR, ARR, churn, LTV, cohort, net revenue retention, revenue by plan and country, MoR against direct comparison, payout and chargeback reports, tenant health and churn-risk signals, coupon impact; admin revenue page; nav, permission, approval and string fragments; handoff and whole-STEP verification.
- Files: `services/subscription/analytics.ts`, `app/(admin)/admin/revenue/**`, `docs/steps/STEP-14/{VERIFY,HANDOFF,DEPENDENCY_REQUESTS}.md`, `scripts/verify/step14-analytics.ts`.
- FEATURE_LIST: 2724-2743 (the parts the data of this STEP supports).
- Done when: whole-STEP verification recorded; handoff lists contracts, ledger account codes, plan keys, payout states, events.
