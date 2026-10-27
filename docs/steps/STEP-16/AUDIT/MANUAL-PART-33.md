<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-33.md -->
# Manual reading, part 33 (features 3169 to 3267, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. The project has no test files by rule 4; checks are scripts in `scripts/verify` and SQL assertions, run in CI.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 3171 | Isolation automated test in CI on every PR | present | `scripts/verify/step08-tenant.mjs`, `step09-tenant.mjs`, `step10-tenant.mjs` run in the `verify` job |
| 3173 | Tenant guard test for search and export | partial | tenant scripts cover steps 8 to 10 and the 16.x tenant insight; search and export of other steps were not seen |
| 3175 | Webhook isolation test | check in browser | `scripts/verify/step04-core.ts` checks webhook signature, window and replay |
| 3194 | Secret leak scan of the client bundle in CI | present | `scripts/check-bundle-secrets.sh` and the `secrets` CI job (gitleaks) |
| 3245 | Server-side permission check everywhere | present | `permission` on every route through `withApi`; UI hiding is not the only control |
| 3252 | Rate limit override per tenant, by admin | present | 16.22 |
| 3256 | IP-based login rate limit | present | `lib/middleware/rate-limit.ts` |
| 3263 | Device fingerprint reuse detection | present | `lib/security/signals.ts`, `services/fraud/signals.ts` |

## Everything here is present or partly checked; nothing is recorded as not built.
