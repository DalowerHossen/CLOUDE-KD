# STEP 13 - Decisions

D1 (2026-10-18). Branch base. `origin/integration` holds only STEP 01; STEPS 02 to 12 live on the session branch `claude/clever-goldberg-8ncdae`. STEP 13 consumes contracts implemented by STEPS 02 to 10, so it continues on this branch (as STEPS 11 and 12 did). The branch already contains the latest `origin/integration` (verified with `git merge-base --is-ancestor`).

D2 (2026-10-18). Baseline. `scripts/integration-check.sh --quick` stops at its first step: the generated barrels `lib/i18n/strings/en.ts`, `config/nav-map.ts` and `config/permissions.ts` are out of date. They belong to the Integrator and are stale since the fragments of STEPS 07 onward were added; this STEP does not edit or regenerate them (it writes fragment files only). The other baseline steps were run by hand and pass: `npm run lint`, `npm run typecheck`, `scripts/check-all.sh`.
