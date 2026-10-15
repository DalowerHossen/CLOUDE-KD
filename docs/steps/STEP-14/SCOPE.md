# STEP 14 - Wallet, Merchant of Record, Payouts, Plans and Subscriptions

Wave D. Depends on: STEP 01 to 05, STEP 07 (kyc contract), STEP 10 (payments contract, routing). Contract use: payments, invoices, kyc, approval, encryption, email, audit, events. Provides contracts: wallet, entitlement (database-backed version replacing the config-based base).

## Feature sources
- Part 4 lines 1786-1868 (F wallet, platform fee, hold period, payout processing; G MoR architecture, KYC-gated routing, risk and settlement), 1623-1668 (B payout partner framework, Local Payment Methods via Licensed Partners listings, partner management), 1933-1972 (J client subscriptions and recurring billing, K BNPL)
- Part 2 lines 870-934 (I plans, subscriptions, coupons, entitlement; J gateway configuration and payout partner settings: tenant side)
- Part 7 lines 2882-2923 (B plan CRUD, subscription management, coupons), 3180-3202 (I entitlement and monetization), 3240-3275 (K revenue analytics, tenant intelligence)
- Part 9 lines 4140-4180 (P Asia payments: local payment method catalogue, generic naming), 4203-4239 (R3 tenant edge cases)
- MASTER_PROMPT rule 5 (generic payment partner naming), wallet balance serializable isolation

## Owned paths and migrations
OWNERSHIP_MAP.md rows 14 and section 4. Migration block `S14_*`. Config: `config/payment-methods.ts` (method codes internal, display labels generic).

## Sub-steps
- 14.1 Ledger: wallets, double-entry ledger entries, holds, balance = ledger sum, serializable transactions, `wallet` contract, fee calculator (platform fee, processor fee, tax), events.
- 14.2 MoR engine: settlement flow from captured payments to wallet credit, reserve and hold periods, KYC-gated routing (uses `kyc` contract and the STEP 10 routing), risk-based holds, settlement reports. Whether the platform acts as merchant of record is controlled by configuration and legal readiness; the code supports both direct-to-owner and MoR modes.
- 14.3 Payouts: payout methods (Global Payout Partners framework, generic labels), payout requests with approval levels by amount, schedules, FX at payout (USD to local, rate frozen at request), statuses, failure handling, admin `(admin)/admin/payouts`, owner `(dashboard)/wallet`.
- 14.4 Local Payment Methods catalogue: country and method configuration with internal codes and generic display labels only (rule 18), enable per country and plan. Tenant-side payment settings page: the owner chooses among the processors and methods that the super admin enabled and the plan allows; owners do not enter processor API keys (those are entered only on the super admin page of STEP 10).
- 14.5 Plans and entitlements: plan CRUD (admin), entitlement matrix, DB-backed `entitlement` service registered over the config-based base, limits and overage rules, upgrade and downgrade rules.
- 14.6 Platform subscriptions: owners subscribe and pay the platform through the payments contract, trials, proration, dunning and grace, cancellation, invoices for the platform fee (platform invoices), admin `(admin)/admin/subscriptions`.
- 14.7 Coupons: one-time policy enforcement, percent or fixed, expiry, usage limits, referral credit codes (no affiliate role), fraud guard, admin `(admin)/admin/coupons`.
- 14.8 Client subscriptions: owner-defined subscription plans for their clients, recurring billing schedules using stored payment method tokens, failed payment retries, pause and cancel, tenant `(dashboard)/subscriptions`.
- 14.9 BNPL framework: eligibility, offer display data for checkout, refund hooks, reports (uses processor capabilities only when official documentation supports them).
- 14.10 Revenue analytics and reports: MRR, ARR, churn, cohort, tenant intelligence, payout reports, `(admin)/admin/revenue`.

## Security notes
Ledger rows are insert-only. Payout creation requires step-up and the approval chain. Wallet reads and writes only through the contract. Money only through `Money`.

## Verification
Ledger sum equals balance after every operation (assertion); parallel payout requests cannot overdraw (script); payout blocked without KYC; coupon second use refused; plan change updates entitlements immediately; no brand name from rule 18 appears anywhere (guard).

## Handoff must list
Contracts, ledger account codes, plan keys, payout states, events.
