# STEP 10 - Verification record

Run on the session branch. Database: PostgreSQL 16 (local). No adapter exists yet, so the end-to-end run with a real processor sandbox is listed in section C and waits for the first adapter of STEP 11.

## A. Commands and results

| Command                                                                                | Result                                                                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`                                                                     | no errors                                                                                                 |
| `npx eslint . --max-warnings 0`                                                        | no problems                                                                                               |
| `bash scripts/check-all.sh`                                                            | ok (all guards, including english-only, no-pan with the new payment rules, money, migrations, dead links) |
| `scripts/db-apply.sh --clean` (72 migrations, applied twice, assertions)               | ok; `s10_001` to `s10_004` pass                                                                           |
| `npx tsx scripts/verify/step10-core.ts`                                                | 28 checks passed                                                                                          |
| `LOG_LEVEL=error npx tsx --conditions=react-server scripts/verify/step10-flow.ts`      | 27 checks passed                                                                                          |
| `node scripts/verify/step10-tenant.mjs`                                                | ok (39 company queries, 25 platform queries)                                                              |
| `node scripts/verify/step10-static.mjs`                                                | ok                                                                                                        |
| `npx tsx scripts/verify/step10-readme.ts --check`                                      | ok                                                                                                        |
| `npm run gen -- --check`                                                               | ok                                                                                                        |
| `SKIP_ENV_VALIDATION=1 npm run build` and `bash scripts/check-bundle-secrets.sh`       | build ok (all STEP 10 pages and API routes listed), bundle secret scan ok                                 |
| rollback: `scripts/db-apply.sh --down S10_001_payment_core.sql` on a migrated database | tables removed                                                                                            |

What each script proves:

- `step10-core.ts`: registry (16 processors, unknown id and missing adapter refused), contract problems found, credential form and strict schema, vault round trip (nothing readable in stored fields, scope bound), modes, routing evaluation (first match, no match, no failover), card rules and HMAC identity, state machine, verification rules, schemas (the browser cannot send an amount), CSP origin rules, link schemas.
- `step10-flow.ts` (fake processors and an in-memory database): see the table in section B.
- `s10_001`: no plaintext credential column, `numeric(18,4)` money, RLS on every table, unique webhook event per processor and event id, immutable credentials, one active mode, mode switch needs a passing test, legal payment status changes only, one open payment per invoice, attempts are a log.
- `s10_002`: a new credentials version disables the processor, enabling needs a passing test for the current credentials, mode and environment, stale versions are refused, environment change disables.
- `s10_003`: card statistics (counted failures exclude insufficient funds, windows, other cards per address, same card on the same invoice only).
- `s10_004`: report and gateway health grouping, one company only, money exact.

## B. SCOPE verification list against evidence

| Required behaviour                                                              | Evidence                                                                                      |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| credentials save then display only last characters                              | core: vault round trip and `describeCredentials`; s10_002                                     |
| test fails -> cannot enable                                                     | s10_002 (failed test, test of another mode)                                                   |
| credentials change -> auto disabled                                             | s10_002                                                                                       |
| unknown processor id -> refused                                                 | core (registry, schema), flow (webhook for `bkash`/`adyen` without adapter -> unknown)        |
| no routing match -> cancelled with `routing_no_match`, no call to any processor | flow "routing: no rule" (calls list empty)                                                    |
| second card payment on the same invoice within 24 hours refused                 | flow "same card cannot pay the same invoice again"                                            |
| third counted failure refused                                                   | flow "third counted failure is refused"                                                       |
| insufficient funds not counted                                                  | flow (three declines for insufficient funds, then success)                                    |
| postal code or IP country mismatch without 3DS -> review queue and no capture   | flow "postal mismatch", "IP country mismatch" (calls show no `capture`)                       |
| 3DS completed skips the comparison                                              | flow "completed 3DS"                                                                          |
| review hold expires -> void                                                     | flow "review hold expires"                                                                    |
| invalid webhook signature rejected                                              | flow "bad signature refused and nothing stored" (+ security event)                            |
| duplicate webhook processed once                                                | flow (second delivery -> `duplicate`, `getTransaction` count unchanged); s10_001 unique index |
| webhook retry, dead letter, manual retry                                        | flow "payment not found yet"                                                                  |
| VPN/proxy blocks the payment                                                    | flow "network" (no payment row, security event)                                               |
| amount only from the invoice                                                    | flow "amount comes from the invoice"; core schema test                                        |
| idempotency key                                                                 | flow "idempotency" (one processor call, conflict on another invoice)                          |
| concurrent payment guard                                                        | flow "open payment guard"; s10_001 unique index                                               |
| refunds: partial, over-refund refused, approval for staff and large amounts     | flow "refunds"                                                                                |
| secrets never in logs, audit, events, attempts, stored rows                     | flow (final scan) and `step10-static.mjs`                                                     |
| payment token never stored                                                      | flow (final scan), `step10-static.mjs`                                                        |
| no card data handling                                                           | `check-no-pan.sh` (extended rules, tested with a bad file)                                    |

## C. Pending for the Integrator (needs an adapter)

After STEP 11 (Stripe) is merged:

1. Save sandbox credentials on `/admin/processors`, run "Test connection", enable, add a routing rule.
2. Create a payment link on `/payments/links` for a sent invoice, open it through the portal page, pay with the processor's official test cards: success, each decline category, 3DS pass and fail, no-3DS with a wrong postal code (expect review), refund, void.
3. Send a signed and an unsigned webhook from the processor's sandbox; send the same event twice.
4. Confirm the payment page response headers carry the payment CSP with only the processor hosts (needs R3 in `DEPENDENCY_REQUESTS.md`).

## D. Build

The production build compiled every STEP 10 page and route (`/admin/processors`, `/admin/processors/routing`, `/admin/payments`, `/admin/payments/review`, `/admin/payments/webhooks`, `/payments`, `/payments/[id]`, `/payments/links`, and the API routes). The build was run with placeholder public variables, so unrelated public pages logged their expected "invalid public environment" messages; this is not a STEP 10 problem.
