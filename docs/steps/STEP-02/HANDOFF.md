# STEP 02 handoff - Data Core and Governance

Branch: claude/clever-goldberg-8ncdae (contains `integration` 0a869c5 and the STEP 01 CI fix 11723d8).

## FEATURE_LIST items implemented (docs/source/FEATURE_LIST.md numbering)

- Isolation and database engineering: 3155-3177, 3392-3410
- Concurrency, locks, duplicate prevention: 3411-3422, 4005-4029, 809-816 (lock primitive only; numbering sequences belong to STEP 09)
- Roles, CEO, admin_staff, approval engine: 3601-3642
- Audit: 3671-3695
- Privacy and compliance: 3304-3306, 3308, 3330-3332, 3731-3744, 3763 (data region field), plus the jurisdiction catalogue for 3745-3756

## Migrations (apply in order)

| File | Content |
|---|---|
| S02_001_foundation | extensions, `uuid_generate_v7`, `set_updated_at`, `bump_version`, `soft_delete_guard`, `apply_standard_triggers`, `rls_enable_default_deny`, `create_live_unique_index` |
| S02_002_tenancy | `companies`, `profiles`, `memberships`, `roles`, `role_permissions`, `feature_flags`, claim helpers `app_company_id()`, `app_role()`, `app_is_platform()`, `app_is_super_admin()` |
| S02_003_locks | `lock_leases`, `kd_acquire_lease`, `kd_release_lease`, `kd_update_with_version` |
| S02_004_audit | `audit_logs`, `audit_checkpoints`, hash chain triggers, `kd_audit_append`, `kd_audit_verify`, `audit_enable_for(table)` |
| S02_005_approvals | `approval_rules`, `approval_requests`, `approval_steps`, `approval_delegations`, `kd_approval_create`, `kd_approval_decide`, `kd_approval_escalate` |
| S02_006_events_jobs | `domain_events`, `job_queue`, `api_idempotency`, claim and finish functions, `kd_purge_queues` |
| S02_007_compliance | `consent_records_platform`, `dsar_requests`, `retention_policies`, `data_classifications`, `kd_dsar_erase_profile`, `kd_apply_retention_core`, seeds |
| S02_008_realtime | `realtime.messages` policies for private presence channels (skipped when the schema does not exist) |

Every table has RLS enabled and forced; no policy means no access. Every change in the tenancy, approval and compliance tables is audited by `audit_enable_for`. Rollback files exist for all eight.

## Tables added beyond OWNERSHIP_MAP section 4

`lock_leases` (see DECISIONS D2). Please add it to the STEP 02 table list.

## Contracts implemented and registered (`services/*/register.ts`, picked up by `npm run gen`)

| Service id | Implementation |
|---|---|
| `tenant` | `services/base/tenant-service.ts` (uses `lib/middleware/tenant.ts`) |
| `locks` | `services/base/lock-service.ts` |
| `permissions` | `services/base/permission-service.ts` (rules in `lib/auth/permissions.ts`) |
| `audit` | `services/audit/audit-service.ts` |
| `approval` | `services/approval/approval-service.ts` |
| `events` | `services/events/event-service.ts` |
| `jobs` | `services/jobs/job-service.ts` |
| `consent` | `services/compliance/consent-service.ts` |

The `idempotency` service is STEP 04. STEP 02 only provides the table `api_idempotency` (columns: scope, idempotency_key, request_hash, state, response_status, response_body, content_type, expires_at; unique on scope + key). The cleanup of expired rows runs in the `queues-purge` cron job.

## Fragment formats

- Permission fragment `config/permissions/sNN-<name>.ts`: `export const permissions: PermissionDefinition[]` with `{ action: 'domain.verb', description, defaultRoles, approvalLevel }`. An action that is not listed is denied. Staff need the action in `defaultRoles` and an owner grant (`memberships.granted_permissions`, entries like `invoice.create` or `invoice.*`). admin_staff need a sub-role whose domains (`SUB_ROLE_DOMAINS` in `lib/auth/roles.ts`) contain the first segment of the action.
- Approval rule fragment `config/approval/sNN-<name>.ts`: `export const approvalRules: ApprovalRuleDefinition[]` with `{ action, level, slaHours }`. Order of lookup: database rule (company, then platform), static rule, permission definition level, then L3.
- Worker handler files (new generator section): `workers/<step>/<name>.job.ts` exports `jobHandler: JobHandlerDefinition` (`{ name, handle(payload, ctx) }`), `workers/<step>/<name>.event.ts` exports `eventHandler: EventHandlerDefinition` (`{ id, events, handle(event) }`). Types: `services/jobs/handler-types.ts`. Events are delivered at least once to all handlers of the event, so handlers must be idempotent.
- Cron fragment `cron/jobs/sNN-<name>.ts`: `export const job: CronJobDefinition`. Call `POST /api/cron/<name>` with `Authorization: Bearer $CRON_SECRET`.
- Retention: other STEPs add a row to `retention_policies` in their migration and call `registerRetentionHandler(dataType, handler)` from `lib/compliance/retention.ts` in a boot hook.

## Job and event names

- Cron jobs: `worker-tick` (every minute), `approvals-escalate` (5 min), `audit-integrity` (15 min), `retention-enforce` (daily 02:43 UTC), `queues-purge` (daily 03:17 UTC).
- Domain events published by STEP 02: `security.event` (audit chain broken). Approval requests notify through the `notification` service type `approval.requested`.
- Audit actions written by STEP 02: `approval.requested|approved|rejected|delegated|delegation_revoked|solo_mode_changed`, `audit.verified`, `dsar.created|exported|erased|rejected`, `retention.changed`, plus `<table>.insert|update|delete` from the row trigger on the tenancy, approval and compliance tables.

## Pages and APIs

- Admin: `/admin/audit`, `/admin/approvals`, `/admin/compliance`. Owner: `/approvals`. All answer 404 unless `auth.getActor()` and `permissions.can()` allow (STEP 03 and the permission matrix).
- APIs: `/api/admin/audit` (+ `/export`, `/verify`), `/api/admin/compliance` (+ `/dsar`, `/dsar/[id]`, `/retention`), `/api/approvals` (+ `/[id]`, `/[id]/decision`, `/bulk`, `/delegations`), `/api/approvals/platform/...` (same set plus `/solo-mode`), `/api/cron/[job]`.
- Navigation fragment `config/nav/s02.ts`; strings `lib/i18n/strings/en/s02-governance.ts`.
- Reusable components: `components/admin/shared/{edit-lock-indicator,conflict-dialog,conflict}`, `lib/providers/presence-provider.tsx` (wrap a page in `PresenceProvider` with the user identity, then call `usePresence('invoice:<id>')`).

## Environment variables used (all already in the STEP 01 fragment)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AUDIT_SIGNING_KEY`, `HMAC_TOKEN_SECRET`, `CRON_SECRET`. No new variables.

## Files outside STEP 02 ownership that were changed (Integrator: review and keep)

| File | Change | Reason |
|---|---|---|
| `lib/api/with-api.ts` | await `routeContext.params` | Next.js 16 passes route params as a promise (DECISIONS D3) |
| `scripts/gen.mjs` | new section for worker handlers | DECISIONS D4 |
| `config/ownership.json` | two patterns for STEP 02 | DECISIONS D6 |
| `lib/bootstrap.generated.ts`, `config/nav-map.ts`, `config/permissions.ts`, `config/approval-rules.generated.ts`, `cron/schedule.generated.ts`, `lib/i18n/strings/en.ts`, `services/jobs/handlers.generated.ts` | regenerated by `npm run gen` | generated barrels |
| `.github/workflows/security.yml`, `.gitleaks.toml`, `docker/Dockerfile` | CI fixes from commit 11723d8 (before STEP 02) | STEP 01 security jobs |

## Known issues

- Supabase Realtime policies (S02_008) and the presence provider were not run against a real Supabase project; the pure logic is verified.
- The pages could not be opened in a browser without the auth service (STEP 03).
- `admin_staff` users without a sub-role have no permissions by design (DECISIONS D8).

## What the Integrator must run

1. `git fetch --all`; merge this branch into `integration` (merge commit).
2. `npm run gen` (all barrels), commit the result.
3. `bash scripts/db-apply.sh --clean` and `bash scripts/run-assertions.sh all`.
4. `bash scripts/integration-check.sh`.
5. Add `lock_leases` to OWNERSHIP_MAP section 4 and the two shared paths to row 02; tag `step-02-merged`.
6. Make sure the production environment sets `AUDIT_SIGNING_KEY`, `HMAC_TOKEN_SECRET` and `CRON_SECRET`, and schedules `POST /api/cron/worker-tick` every minute (Netlify scheduled function or Linux cron) and the other cron names from the list above.
