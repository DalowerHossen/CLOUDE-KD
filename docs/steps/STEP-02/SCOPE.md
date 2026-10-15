# STEP 02 - Data Core and Governance

Wave B. Depends on: STEP 01 (contracts, scripts). Provides contracts: tenant, audit, permissions, approval, events, jobs, locks, consent. Consumes: encryption (STEP 05) and security (STEP 04) only through contracts.

## Feature sources
- Part 9 lines 3743-3769 (A isolation), 3919-3952 (G privacy), 4024-4046 (K database engineering), 4048-4060 (L concurrency)
- Part 11 lines 4436-4481 (A roles, CEO, admin_staff, approval engine), 4513-4540 (C audit), 4581-4622 (E compliance, jurisdictions, data residency), 4884-4911 (M conflict and duplicate prevention)
- Part 3 lines 1000-1008 (numbering lock primitive only), MASTER_PROMPT: database schema rules, conflict and duplicate prevention, immutable audit log

## Owned paths and migrations
OWNERSHIP_MAP.md rows 02 (paths) and section 4 (tables). Migration block `S02_*`.

## Sub-steps
- 02.1 Migration foundation: extensions (pgcrypto, pg_trgm, pg_cron), `uuid_generate_v7()`, `set_updated_at`, soft-delete helpers, enum conventions, `rls_enable_default_deny(table)` helper, `version` bump helper, partial unique index helper.
- 02.2 Tenancy tables: companies, profiles, memberships, role tables, permission tables, feature_flags; JWT claim helper function (`SECURITY DEFINER`, wrapped for RLS performance); platform-level versus tenant-level policies; read-only policies for shared tables.
- 02.3 Supabase clients and tenant middleware: browser, server, admin (service role, server only), `lib/middleware/tenant.ts`, cross-tenant guard returning 404, `getTenantContext`.
- 02.4 Concurrency base: `services/base/optimistic-lock.ts`, `pessimistic-lock.ts`, advisory lock helper, `withTransaction`, serializable helper, ConflictError mapping, duplicate-detector base class.
- 02.5 Audit log: append-only table (UPDATE and DELETE blocked by trigger and policy), sequence number with gap detection, hash chain (SHA-256 of the previous entry), Ed25519 signature (key from environment), periodic Merkle checkpoint, verification function, integrity cron job, tamper event, generic audit trigger for all tables, `AuditService`, search/filter API, CSV/JSON/CEF export, admin page `(admin)/audit`, retention setting.
- 02.6 Roles and permissions: `lib/auth/roles.ts` (5 roles, 7 admin_staff sub-roles), `lib/auth/permissions.ts`, permission fragment loader, owner-controlled staff permission model, `can()` service.
- 02.7 Approval engine: rules (`lib/auth/approval-rules.ts`, levels L0 to L3 plus dual), requests and steps, SLA and auto-escalation job, delegation, bulk approve, reject with reason, history, solo mode (super_admin only), staff-draft to owner approval path, services, admin page `(admin)/approvals`, owner page `(dashboard)/approvals`, notifications through events.
- 02.8 Events and jobs: `domain_events` outbox, subscriber runner, `job_queue` with `FOR UPDATE SKIP LOCKED`, retries, dead letter, leader lock (`cron/base/leader-lock.ts`), `app/api/cron/[job]` entry protected by a cron secret, `workers/runner.ts`, API idempotency table.
- 02.9 Compliance data layer: data classification registry, retention policies and job, consent manager, DSAR export and erase (tombstones that keep the audit chain valid), per-jurisdiction settings, data residency field `data_region`, admin page `(admin)/compliance`.
- 02.10 Presence and co-editing: `lib/providers/presence-provider.tsx` (Supabase Realtime), edit-lock indicator with 5 minute timeout, conflict resolution UI components in `components/admin/` shared use.
- 02.11 SQL assertions: `sql/assertions/s02_*.sql` (two tenants, every table: no cross-read, no cross-write; audit immutability; chain verification; version conflict; approval chain rules).

## Security notes
Default deny on every table. Service role is used only in server code paths that cannot take client input as tenant id. Audit rows contain no raw PII (references or hashes only). Cross-tenant ids answer 404.

## Verification
`scripts/db-apply.sh --clean` passes; `scripts/run-assertions.sh s02` passes; an UPDATE or DELETE on `audit_logs` fails for every role; tampering with one row makes the verification job report the exact sequence number; approving one's own request is rejected; version mismatch raises ConflictError and shows the conflict UI.

## Handoff must list
Tables, policies, contract implementations registered, permission and approval-rule fragment format, job and event names.
