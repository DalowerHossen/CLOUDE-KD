## STEP and sub-steps

STEP: NN
Sub-steps: NN.k, NN.k

## What changed

-

## Checklist

- [ ] Only files owned by this STEP changed (`scripts/check-ownership.sh NN`)
- [ ] `docs/steps/STEP-NN/PROGRESS.md` and `HANDOFF.md` are current
- [ ] Guards pass (`scripts/check-all.sh`), lint and typecheck pass
- [ ] Migrations have rollback files and pass `scripts/db-apply.sh --clean`
- [ ] No tests, no unfinished markers, no `any`, no console, no card data handling
- [ ] Security checklist Z1-Z14 reviewed for every sub-step
- [ ] Dependency requests recorded in `DEPENDENCY_REQUESTS.md` (not in package.json)
