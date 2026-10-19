# STEP 14 - Requests to the Integrator

**R1 Ownership rows (`docs/execution/OWNERSHIP_MAP.md`).** Please add to row 14: `workers/s14/**` and `config/s14-*.ts`.

**R2 Settlement gate in the payment flow (`services/payment/payments.ts`, `lib/payment/routing.ts`).** STEP 14 provides `settlementMode(companyId)` in `services/mor/mode.ts` (`mor`, `direct` or `suspended`, with a reason). When the platform runs in merchant-of-record mode, STEP 10 should refuse a payment for a company whose mode is `suspended` and tell the payer that online payment is not available now. Until then the gate is advisory.

**R3 Stored methods, recurring charges and payouts in the adapter contract (`types/contracts/payment-adapter.ts`).** Please add optional operations to `ProcessorAdapter` for creating a stored payment method from a secure-form token, charging it later, and paying out to a payout destination, each implemented per processor only after reading its official documentation. Until then client subscriptions send an invoice every cycle and payouts use the manual partner.

**R4 Invoice creation in the `invoices` contract (`types/contracts/invoice.ts`).** STEP 14 creates and sends invoices (client subscriptions, platform invoices) through `services/invoice/invoices.ts` and `send.ts`. Please add `create` and `send` to the contract if direct calls are not wanted.

**R5 Plan keys in routing rules (`schemas/payment/*`).** Routing rules accept only `free|pro|business|enterprise`. Plans added by the platform team have other slugs; please validate against the plans known to the entitlement service.

**R6 Regenerate the barrels (`config/nav-map.ts`, `config/permissions.ts`).** STEP 14 adds `config/nav/s14.ts`, `config/permissions/s14-*.ts` and approval rule fragments `config/approval/s14-*.ts`. The two barrels were stale before this STEP (DECISIONS D2), so they were not regenerated here. Please run `npm run gen` at integration; until then the wallet menu entries and the new permissions (`wallet.read`, `payout.*`) are not active.

**R7 Cron schedule and worker barrels.** `cron/schedule.generated.ts`, `lib/bootstrap.generated.ts` and `services/jobs/handlers.generated.ts` were regenerated with the STEP 14 jobs (`s14-holds`, `s14-payouts`) and the worker `mor.settle`. Please keep them when merging.

**R8 Email catalogue line.** `emails/catalog.ts` got one line for `emails/billing/index.ts`, as the STEP 05 convention allows.

**R9 Checkout method list and method fee.** `checkoutMethods(companyId)` in `services/payout/payment-methods.ts` answers the methods a payer can choose (ordered, with icon and words). Please call it from the payment page of STEP 10 and, when a method has a fee model (`feeModel` of `resolveMethods`), let `services/mor/settle.ts` use it in place of the platform schedule (a later request once the partner adapters exist, R3).

**R10 Limit checks at the creation points.** Please call `assertWithinLimit(companyId, key)` from `services/entitlement/usage.ts` (or `getService('entitlement').limit` with your own count) before creating an invoice (`invoices.monthly`), a client (`clients.max`) and a team member (`staff.seats`), and `paywall(companyId, key)` where a locked feature is opened, so the server enforces plan limits everywhere (FEATURE_LIST 2676, 2680). STEP 14 provides the functions; the calls belong to the creating STEPs.

**R11 Plan change on the tenant.** `services/plan/migrate.ts` writes `companies.plan_key` with the service role. Please add a method to the `tenant` contract (for example `setPlan(companyId, planKey)`) so the write goes through STEP 02, and let `changeCompanyPlan` call it.
