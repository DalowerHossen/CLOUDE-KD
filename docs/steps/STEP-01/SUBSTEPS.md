# STEP 01 - SUBSTEPS

Every sub-step stays inside the paths that OWNERSHIP_MAP.md assigns to STEP 01. Verification commands: `npm run lint`, `npm run typecheck`, `scripts/check-all.sh`, `npm run gen -- --check`, plus the commands named per sub-step.

| Id | Goal | Main files | Done when |
|---|---|---|---|
| 01.0 | Route namespace and fragment naming decisions recorded in the docs | docs/execution/*, docs/ADR | DECISIONS.md written, ownership map updated |
| 01.1 | Scaffold: Next.js 16, TypeScript strict, ESLint, Prettier, Husky, ignore files, folder skeleton | package.json (scripts), tsconfig.json, eslint.config.mjs, .prettierrc, next.config.js, tailwind.config.ts, postcss.config.js, components.json, .husky/*, folders | lint and typecheck configs load |
| 01.2 | Dependency baseline and lockfile | package.json, package-lock.json, scripts/apply-dependency-requests.sh | `npm ci` succeeds |
| 01.3 | Guard scripts and check runners | scripts/check-*.sh, scripts/check-*.mjs, scripts/lib/, scripts/{check-all,integration-check,db-apply,run-assertions}.sh, config/ownership.json, supabase/local-shim.sql | `scripts/check-all.sh` passes; verify script proves each guard fails on a seeded violation |
| 01.4 | CI/CD skeleton | .github/workflows/*, CODEOWNERS, PR template, dependabot | YAML valid |
| 01.5 | Environment system | lib/env/*, config/env/s01.env.fragment | env loader fails fast on missing names and never prints values |
| 01.6 | Core libraries | lib/errors, lib/logger, lib/utils, lib/api/with-api.ts | verify script passes (Money math, uuid v7, redaction, error response, withApi pipeline) |
| 01.7 | Container and contracts | lib/container.ts, types/contracts/*, types/events.ts, config/plans.ts, lib/entitlement/* | typecheck passes; contract list equals CONTRACTS.md |
| 01.8 | Generators | scripts/gen.mjs and generated barrels, fragments for s01 | `npm run gen -- --check` clean |
| 01.9 | Design system base | config/design-tokens.json, styles/*, tailwind config, components/ui/*, lib/providers, stores | build passes; tokens exported |
| 01.10 | Shells and states | components/layout/*, components/shared/*, app root and group layouts, shell-preview pages | shells render at 320, 768, 1280 px in light and dark |
| 01.11 | Deploy skeleton | netlify.toml, docker/*, supabase/config.toml, scripts/{backup,restore,deploy}.sh, instrumentation.ts | compose file validates |
| 01.12 | Documentation and branch | README, CONTRIBUTING, SECURITY, CHANGELOG, LICENSE, docs/ADR, docs/RUNBOOKS/README.md | docs present; `integration` equals merged result |
