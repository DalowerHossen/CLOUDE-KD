# INTEGRATION CHECKLIST (Integrator session)

The Integrator session is a separate chat opened by the owner after one or more STEPs report a handoff. It is not one of the 16 STEPs.

## A. Merge one STEP into `integration`

1. `git fetch --all`; check out `integration`; merge the step branch (merge commit, never rebase or force).
2. Run `scripts/check-ownership.sh <step-branch>`: no file outside the STEP's owned paths.
3. Apply `docs/steps/STEP-NN/DEPENDENCY_REQUESTS.md` with `scripts/apply-dependency-requests.sh`; commit `package.json` and the lockfile.
4. Run `npm run gen` (barrels for i18n, nav, permissions, env, cron, bootstrap, middleware chain, processor adapters index, `.env.example`). Commit generated files.
5. Check migration numbers: only the `S{NN}_` block of that STEP; each has a `_down` file; no duplicate table names (`scripts/check-migrations.sh`).
6. `scripts/db-apply.sh --clean` applies all migrations from zero; then regenerate `types/database.ts`.
7. Run `scripts/run-assertions.sh all` (SQL assertions of every merged STEP).
8. Run `npm run lint`, `npm run typecheck`, `npm run build`, `scripts/check-all.sh`.
9. Read `docs/steps/STEP-NN/HANDOFF.md` and `BLOCKERS.md`; resolve or forward open items.
10. Commit `chore(integration): merge STEP NN`, tag `step-NN-merged`, push `integration`.

Merge order: ascending STEP number. A STEP that consumes a contract implemented by a lower-numbered STEP is exercised only after that STEP is merged.

## B. Waves (recommended; any order is safe as long as merges follow section A)

- Wave A: STEP 01 alone (everything else needs its contracts). Merge before anything starts.
- Wave B (start together): STEPs 02, 03, 04, 05, 06.
- Wave C (start together): STEPs 07, 08, 09, 10, 15, 16.
- Wave D (start together): STEPs 11, 12, 13, 14.
After STEP 01 is merged, all of STEPs 02 to 16 may also start at the same moment.

## C. Contract changes

A change request in any `BLOCKERS.md` is decided by the Integrator. Edit the contract in `types/contracts/`, update `CONTRACTS.md`, notify affected STEPs by adding a line to their `DECISIONS.md`.

## D. Release Gate (after STEP 16 is merged)

1. Full clean build; all guard scripts; all SQL assertions.
2. Performance: Lighthouse CI >= 90, LCP < 2.5 s, INP < 200 ms, CLS < 0.1, initial JS < 200 KB; PWA manifest and service worker; image and font optimization.
3. Accessibility pass (keyboard, screen reader, contrast, reduced motion) on every route in `config/nav-map.ts`.
4. 320 px layout pass on every page; dead-link scan in strict mode (`node scripts/check-dead-links.mjs --strict`); sitemap and robots check.
5. Security pass: header and CSP scan, OWASP ZAP baseline, Semgrep, dependency audit, secret scan, RLS assertions for every table, token and webhook abuse checks, VPN/Proxy/Tor policy check on signup, payment, KYC, admin.
6. Payment pass: every processor verification record complete in `docs/processors/`; routing no-match cancels; card rules; 3DS fallback rules; review queue.
7. Documentation: README, CONTRIBUTING, SECURITY, ERD, ADRs, API docs, RUNBOOKS, disaster recovery plan.
8. Deployment: Netlify configuration, Docker build, environment variable list, migration rollback rehearsal, backup and restore rehearsal.
9. No deployment on Friday after 15:00 (policy).
10. Tag `v1.0.0` on `integration` only when every item above is recorded as passed in `docs/RELEASE_REPORT.md`.
