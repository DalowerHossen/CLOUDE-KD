# Contributing

1. Work on exactly one STEP per branch. Start from the latest `origin/integration`.
2. Read `CLAUDE.md` and `docs/execution/STEP_PROTOCOL.md`. Write `SUBSTEPS.md` before code.
3. Write only inside the paths your STEP owns (`docs/execution/OWNERSHIP_MAP.md`). Check with `bash scripts/check-ownership.sh <step-number>`.
4. Shared files are changed through fragments and `DEPENDENCY_REQUESTS.md`, never directly.
5. One commit per sub-step. Commit messages follow conventional commits: `feat(step05): 05.3 storage adapters`. Allowed types: feat, fix, docs, style, refactor, perf, chore, build, ci.
6. Before each commit run `npm run lint`, `npm run typecheck`, `npm run check` and `node scripts/gen.mjs --check`.
7. Only the Integrator merges into `integration`. Never force-push or rewrite history.
8. Do not add test files. Verification lives in `scripts/verify/`, `sql/assertions/` and `docs/steps/STEP-NN/VERIFY.md`.
9. Do not deploy on Friday after 15:00 UTC.
