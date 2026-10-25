# CROSS-STEP CONTRACTS

STEP 01 creates every file in `types/contracts/` exactly as described here. These are TypeScript interfaces and Zod schemas only. The owner STEP creates the implementation and registers it in the container (`services/<domain>/register.ts`). Consumers resolve it with `getService('<id>')` from `lib/container.ts`. A STEP that needs a change to a contract writes `BLOCKERS.md`; only STEP 01 or the Integrator changes a contract.

All money values in contracts use the `Money` type (decimal.js wrapper, USD, 4 decimal places). No contract exposes a JavaScript number for money.

| Contract file | Service id | Implemented by | Main consumers | Operations |
|---|---|---|---|---|
| `tenant.ts` | `tenant` | 02 | all | `getTenantContext()` -> companyId, actor role, plan; `assertSameTenant(resource)` -> throws NotFoundError |
| `audit.ts` | `audit` | 02 | all | `record({ action, resourceType, resourceId, metadata })` (actor, tenant, ip, correlationId filled from context); `verifyChain(range)` |
| `permissions.ts` | `permissions` | 02 | all | `can(actor, action, resource)`; `requireApproval(action)` -> level L0..L3 |
| `approval.ts` | `approval` | 02 | 03,07,10,14,15 | `request({ action, payload, requesterId })`; `decide(requestId, decision)`; `status(requestId)` |
| `events.ts` | `events` | 02 | all | `publish(event)` to the `domain_events` outbox; `subscribe` by handler files under `workers/` |
| `jobs.ts` | `jobs` | 02 | all | `enqueue(name, payload, opts)`; handlers in `workers/<step>/<job>.ts` |
| `locks.ts` | `locks` | 02 | 08,09,10,14,15 | `withAdvisoryLock(key, fn)`; `withRowLock(table, id, fn)`; `updateWithVersion(table, id, version, patch)` |
| `consent.ts` | `consent` | 02 | 06,13,16 | `record`, `has`, `withdraw` |
| `auth.ts` | `auth` | 03 | all | `getActor()`; `requireRole(roles)`; `requireStepUp({ maxAgeSeconds })` (2FA code plus fresh password check); `lockState(identifierHash)` |
| `security.ts` | `security` | 04 | all | `rateLimit(key, policy)`; `verifyTurnstile(token)`; `checkNetwork(ip, context)` -> `{ vpn, proxy, tor, datacenter, countryCode, score, allowed }` where context is signup, login, payment, kyc, admin, other; `riskScore(subject)`; `raiseSecurityEvent(type, details)`; `sanitize(input, schema)` |
| `idempotency.ts` | `idempotency` | 04 | all (via `withApi`) | `begin({ scope, key, requestHash })` -> `new` / `replay` (cached response) / `conflict`; `complete(scope, key, response)` |
| `tokens.ts` | `tokens` | 04 | 13,15 | `issue({ docType, docId, expiresAt, otp? })` -> url token; `verify(token)`; `revoke(id)`; `reissue(id)`; `verifyOtp(id, code)` |
| `encryption.ts` | `encryption` | 05 | 03,07,10,14,16 | `encrypt(purpose, plaintext, scope?)` -> `{ ciphertext, iv, tag, keyVersion }`; `decrypt(purpose, payload, scope?)`; purposes: `files`, `processor-credentials`, `oauth-tokens`, `kyc`, `pii`; keys come only from environment |
| `storage.ts` | `storage` | 05 | 07,08,09,13,15,16 | `put({ companyId, category, bytes, meta })` -> file record with `storageProvider`; `get(fileId)`; `signedUrl(fileId, ttl)`; `remove(fileId)`; `resolveProvider(companyId)`; `migrate(fileId, targetProvider)` |
| `email.ts` | `email` | 05 | all | `send({ template, to, data, companyId?, idempotencyKey })`; `enqueue(...)`; `registerTemplate(def)` |
| `notification.ts` | `notification` | 05 | all | `notify({ userId or companyId, type, data })` |
| `pdf.ts` | `pdf` | 09 | 10,13,15 | `render(kind, data)` -> bytes; kinds: invoice, estimate, receipt, payslip, report, evidence-pack |
| `client.ts` | `clients` | 08 | 09,10,13 | `getById(id)`; `getBilling(id)` -> name, email, billing postal code, country |
| `invoice.ts` | `invoices` | 09 | 10,13,14,15,16 | `getForPayment(invoiceId)` -> amountDue, currency=USD, billingPostalCode, billingCountry, status, version; `applyPayment({ invoiceId, paymentId, amount })`; `markDisputed`; `snapshot(invoiceId)`; `createForOrder({ companyId, createdBy, reference, customerName, customerEmail, customerCountry, customerPostalCode, description, amount })` -> `{ invoiceId, invoiceNumber }` (a sent one-line invoice for an outside order); `voidForOrder({ companyId, invoiceId, voidedBy, reason })` |
| `payment-adapter.ts` | (static types) | 01 types, 10 re-exports | 10,11,12 | `ProcessorAdapter` interface, `ProcessorId` union (16 ids), `ProcessorCapabilities`, `DeclineCategory`, `CredentialField`, `ProcessorMode` (see PAYMENT_PROCESSORS.md section 5) |
| `payment.ts` | `payments` | 10 | 09,13,14,15,16 | `createPayment({ invoiceId, idempotencyKey, ... })`; `refund(paymentId, amount)`; `getPayment(id)`; `listReview()`; `createLink({ companyId, invoiceId, createdBy, validHours })` -> `{ linkId, url, expiresAt }`; `revokeLink({ companyId, linkId })` |
| `entitlement.ts` | `entitlement` | 01 (config-based base in `lib/entitlement/`), 14 (database-backed, registered with `override: true`) | all | `has(companyId, key)`; `limit(companyId, key)` |
| `wallet.ts` | `wallet` | 14 | 10,13 | `credit`, `debit`, `hold`, `release` (ledger entries, serializable) |
| `kyc.ts` | `kyc` | 07 | 10,14 | `status(companyId)`; `isVerified(companyId)` |
| `accounting.ts` | `accounting` | 15 | none directly | fed by domain events `invoice.*`, `payment.*`, `refund.*`, `payout.*`, `expense.*`, `payroll.*` |
| `fx.ts` | `fx` | 09 | 10,14,15 | `rateAt(currency, timestamp)`; `convertForDisplay(money, currency)`; rates are frozen on the invoice |

## Domain events (names are fixed; STEP 01 lists them in `types/events.ts`)

`invoice.created|sent|viewed|paid|partially_paid|voided|overdue`, `estimate.sent|approved|rejected`, `payment.authorized|captured|failed|pending_review|voided|refunded`, `dispute.opened|evidence_submitted|won|lost`, `payout.requested|approved|paid|failed`, `client.created|updated`, `file.stored|migrated|quarantined`, `kyc.submitted|approved|rejected`, `auth.account_locked|account_unlocked|new_device`, `security.event`, `subscription.created|renewed|cancelled`, `expense.created`, `payroll.run_approved|run_paid`.

## Cross-STEP data rules

1. No foreign key from a lower-numbered STEP to a higher-numbered table. Use ids stored as plain UUID plus a contract lookup.
2. Money columns are `numeric(18,4)`. Currency is always USD for stored amounts. Display currency conversions use `fx`.
3. Every API route is wrapped by `withApi()` from `lib/api/` (STEP 01). It runs: correlation id, network and rate-limit checks, authentication, tenant resolution, permission check, Zod validation, idempotency (when required), handler, audit, structured error response.
4. `withApi()` calls the container services. If a service is not registered yet, it fails with `ServiceNotRegisteredError`; the Integrator runs `scripts/integration-check.sh` after merging so providers exist before consumers are exercised.
