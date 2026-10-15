# STEP PROTOCOL (the same procedure for every chat)

Applies to STEP 01 to STEP 16. Follow it in order. Do not skip a phase.

## 1. Roles

- **Step chat**: builds exactly one STEP, only in the paths that the STEP owns.
- **Integrator session**: merges step branches into `integration`, owns shared files, applies dependency requests, runs the integration checklist. (See INTEGRATION_CHECKLIST.md.)

## 2. Phase 0 - Orientation (no code)

1. Complete the "First actions" list in CLAUDE.md section 3.
2. `git fetch origin integration` and confirm the session branch contains the latest `origin/integration`. If not, merge `origin/integration` into the session branch (merge commit, no rebase).
3. Run `scripts/integration-check.sh --quick`. The baseline must pass. If it does not, write `BLOCKERS.md` and stop.
4. Confirm that every contract the STEP consumes exists in `types/contracts/`.

## 3. Phase 1 - Decompose (no code)

1. Create `docs/steps/STEP-NN/SUBSTEPS.md` from the sub-step list in SCOPE.md. Split further when a sub-step would exceed: 15 files, 1 migration group, or about 90 minutes of work.
2. Each sub-step entry has: id (NN.k), goal, files (all inside owned paths), migration file names (`S{NN}_{seq}_...`), FEATURE_LIST item numbers it covers, security checks, verification commands, "done when".
3. Create `PROGRESS.md` with one checkbox per sub-step.
4. Commit: `docs(stepNN): substeps plan`. Push the session branch.

## 4. Phase 2 - Sub-step loop (repeat for each sub-step, in order)

1. Read the exact FEATURE_LIST lines for the sub-step and the contracts it uses.
2. Write complete code. No placeholders. Follow the 20 rules and the 17-point list in section 5.
3. Run, in this order, and fix until clean:
   - `npm run lint` and `npm run typecheck`
   - `scripts/check-all.sh` (all guard scripts)
   - `scripts/db-apply.sh --clean` when the sub-step has a migration
   - `sql/assertions/sNN_*.sql` runner (`scripts/run-assertions.sh sNN`)
   - the sub-step's commands from `VERIFY.md`
4. Review the diff against the security checklist (section 6).
5. Update `PROGRESS.md` (checkbox, date, commit hash from the previous commit).
6. Commit: `feat(stepNN): NN.k <summary>`. One sub-step equals one commit (more only if the sub-step is split).
7. Push the session branch.

## 5. The 17-point build list (from the master prompt, applies to every feature)

1 TypeScript strict types. 2 Zod validation (strict). 3 Input sanitization (`lib/security/sanitizer.ts`). 4 RLS policy for each table. 5 Audit log entry for each mutation. 6 Error handling with custom errors. 7 Correlation id. 8 Rate limiting for APIs. 9 Idempotency for mutations. 10 Optimistic locking for editable records. 11 Duplicate detection where listed. 12 UI with loading, error, empty and success states. 13 Mobile layout at 320px. 14 Accessibility (ARIA, keyboard, focus). 15 Dark mode. 16 Path comment and JSDoc for complex logic. 17 English strings only, kept in `lib/i18n/strings/en/<domain>.ts`.

## 6. Security checklist (Zero Trust, Zero Tolerance) - every sub-step

- Z1 Every request is authenticated and re-verified; no route is public unless the STEP says so.
- Z2 Tenant context resolved from the session, never from client input; a foreign-tenant id returns 404.
- Z3 Permission check through the permission contract; least privilege.
- Z4 Strict Zod schema; unknown fields rejected.
- Z5 Output encoded; no raw HTML without DOMPurify.
- Z6 No secret, token, card data, password or PII in logs, errors or client bundles.
- Z7 Sensitive data encrypted with the encryption contract; keys only from environment.
- Z8 State-changing calls are POST/PUT/PATCH/DELETE with CSRF protection and rate limits.
- Z9 Money handled with `Money` (decimal.js); stored as numeric(18,4).
- Z10 Audit entry written with actor, tenant, resource, ip, correlation id.
- Z11 Zero-tolerance events (injection attempt, CSRF failure, token abuse) raise a security event through the security contract.
- Z12 Webhook inputs verified by signature before parsing; processing is idempotent.
- Z13 Files pass the file validator before storage; downloads use short-lived signed URLs.
- Z14 VPN/Proxy/Tor policy applied on signup, payment, KYC and admin routes.

## 7. Phase 3 - STEP closure

1. Run the whole STEP verification (SCOPE.md "Verification" and `VERIFY.md`). Record results in `VERIFY.md`.
2. Write `docs/steps/STEP-NN/HANDOFF.md`: FEATURE_LIST item numbers implemented, files created, migrations added, contracts provided, dependency requests, env fragments, nav and permission fragments, known issues (write "none" when none), what the Integrator must regenerate or run.
3. Commit: `docs(stepNN): handoff`. Push the session branch.
4. Final reply: the closing summary required by CLAUDE.md section 10.

## 8. Resume protocol (when a chat ends before the STEP is finished)

The user opens a new chat and sends the resume message. The new chat repeats Phase 0, then reads `PROGRESS.md`, and continues from the first unchecked sub-step. It never redoes finished sub-steps and never renumbers them. For STEPs 11 and 12 a fresh chat per processor is allowed and encouraged: the resume message names the processor id.

## 9. Forbidden actions

- Editing files outside the owned paths.
- Adding a package directly to `package.json` (use `DEPENDENCY_REQUESTS.md`).
- Creating test files.
- Leaving TODO, FIXME, "Coming Soon", lorem ipsum or empty handlers.
- Guessing a processor API or a cross-STEP interface.
- Merging into `integration` from a step chat.
- Skipping a sub-step's verification.

## 10. Commit message format

```
feat(stepNN): NN.k short summary

Body: what was added, files, migration names, FEATURE_LIST items.
```

Types: feat, fix, docs, refactor, perf, chore. Never use `test`.

## 11. Per-STEP files (all inside `docs/steps/STEP-NN/`)

SCOPE.md (given), SUBSTEPS.md, PROGRESS.md, DECISIONS.md, BLOCKERS.md (only if blocked), DEPENDENCY_REQUESTS.md, VERIFY.md, HANDOFF.md.
