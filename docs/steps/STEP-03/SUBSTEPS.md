# STEP 03 - Sub-steps plan

Session branch: claude/clever-goldberg-8ncdae (contains STEP 01 and STEP 02). Migration block `S03_001` onward, each with `_down.sql`. Assertions `sql/assertions/s03_*.sql` (lock persistence is `s03_lock_state.sql`).
Common checks per sub-step: `npm run lint`, `npm run typecheck`, `bash scripts/check-all.sh`; with a migration also `bash scripts/db-apply.sh --clean` (PGHOST=/tmp/pgsock); then `npx prettier --write` on touched files before the commit. Security checklist Z1 to Z14 reviewed on every diff.

| Id | Goal | Files | Migrations | FEATURE_LIST | Done when |
|---|---|---|---|---|---|
| 03.1 | Read current Supabase Auth, MFA and Auth Hooks documentation; record findings and the enforcement decision | docs/steps/STEP-03/DECISIONS.md | none | REQ-LOCK 8 | decision recorded with source links |
| 03.2 | Auth tables and policies | migrations/S03_001_auth_tables.sql (+down), sql/assertions/s03_001_auth_tables.sql | S03_001 | Part 2 473-554 | 10 tables, RLS forced, client access closed or own-row only |
| 03.3 | Lock configuration and password policy libs | config/auth-lock.ts, lib/auth/password.ts, lib/auth/disposable-emails.ts, schemas | none | Part 2 473-554 | policy, HIBP k-anonymity, history check, disposable block |
| 03.4 | Lock engine (database functions and TS) | migrations/S03_002_lock_engine.sql (+down), lib/auth/lock.ts, sql/assertions/s03_lock_state.sql | S03_002 | REQ-LOCK 1-3,5-7 | state persisted, 2 failures lock 2 h, reset only on full login |
| 03.5 | Sign-up, verification, login, logout, forgot and reset APIs and pages | app/api/auth/*, app/(auth)/*, emails/auth/*, services/auth/* | none | Part 2 473-554 | uniform responses, equalized timing, reset disabled while locked |
| 03.6 | Two-factor and step-up | lib/auth/two-factor.ts, lib/auth/step-up.ts, app/api/auth/2fa/* | S03_003 (if needed) | Part 2, Part 11 4854-4882 | TOTP, 10 hashed backup codes, failures feed lock, step-up 300 s |
| 03.7 | Sessions and devices | lib/auth/session.ts, services/auth/session-service.ts | none | Part 2, Part 11 4854-4882 | rotation, timeout, revoke, new device and IP change events |
| 03.8 | OAuth Google and GitHub | lib/auth/oauth.ts, app/api/auth/oauth/* | none | Part 2 | state, PKCE, encrypted tokens, safe linking |
| 03.9 | Auth service registration (contract `auth`) | services/auth/register.ts, auth-service.ts | none | CONTRACTS auth | getActor, requireRole, requireStepUp, lockState |
| 03.10 | Unlock workflow | app/(admin)/admin/account-locks, app/api/admin/account-locks, components | S03_004 (if needed) | REQ-LOCK 4 | request, owner confirmation, unlock, audits, event |
| 03.11 | Impersonation | lib/auth/impersonation.ts, admin page and API, banner | none | Part 7 2846-2854 | super_admin only, step-up, time-limited, audited |
| 03.12 | Account security page | app/(dashboard)/account/security | none | Part 2 | 2FA status, backup codes, sessions, devices, password change |
| 03.13 | Verification, closure | docs/steps/STEP-03/{VERIFY,HANDOFF}.md | none | all | all checks recorded |

The numbering may split further when a sub-step grows beyond 15 files; PROGRESS.md follows the real ids.
