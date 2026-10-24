# STEP 02 verification record

Date: 2026-10-15. Branch: claude/clever-goldberg-8ncdae. PostgreSQL 16 (plain, with `supabase/local-shim.sql`).

## Commands and results

| Command | Result |
|---|---|
| `bash scripts/integration-check.sh` (generators current, lint, typecheck, all guards, migrations from zero twice, assertions, production build, client bundle secret scan) | ok |
| `bash scripts/db-apply.sh --clean` | 8 migrations applied and re-applied cleanly |
| `bash scripts/run-assertions.sh s02` | 7 assertion files ok |
| `npx tsx scripts/verify/step02-core.ts` | 17 checks ok |
| `bash scripts/check-all.sh` | ok |

## SCOPE.md verification items

| Requirement | Evidence |
|---|---|
| `db-apply.sh --clean` passes | S02_001 to S02_008 apply from zero and a second time without error |
| `run-assertions.sh s02` passes | s02_001 foundation, s02_002 tenancy, s02_003 locks, s02_004 audit, s02_005 approvals, s02_006 events and jobs, s02_007 compliance, s02_011 isolation |
| UPDATE or DELETE on `audit_logs` fails for every role | `s02_004_audit.sql` (superuser, service_role, authenticated) and `s02_011_isolation.sql` (anon too); TRUNCATE is blocked as well |
| Tampering with one row makes verification report the exact sequence | `s02_004_audit.sql`: changing the metadata of sequence N makes `kd_audit_verify` return `firstBrokenSequence = N`; deleting a row returns the gap list |
| Approving one's own request is rejected | `s02_005_approvals.sql` (SQLSTATE 42501); solo mode exception only for super_admin |
| Version mismatch raises ConflictError and shows the conflict UI | `kd_update_with_version` raises 40001 (`s02_003_locks.sql`); `services/base/optimistic-lock.ts` maps it to `ConflictError` (409, code `conflict`); `components/admin/shared/conflict-dialog.tsx` is the UI |
| Two tenants, every table: no cross-read, no cross-write | `s02_011_isolation.sql` loops over all tables that have `company_id` |
| Erasure keeps the audit chain valid | `s02_007_compliance.sql` |

## Not exercised in this environment

- Supabase Realtime presence (`lib/providers/presence-provider.tsx`) and the `realtime.messages` policies in S02_008: the plain PostgreSQL database has no `realtime` schema, so the migration skips them. The pure lock logic is covered by `step02-core.ts`.
- Browser layout checks at 320, 768 and 1280 px for the new pages (`/admin/audit`, `/admin/approvals`, `/admin/compliance`, `/approvals`): the pages need the auth service (STEP 03) to render, so they were compiled and type-checked but not opened in a browser.
- `pg_cron` (not available in plain PostgreSQL): cron jobs are driven through `/api/cron/[job]`.
