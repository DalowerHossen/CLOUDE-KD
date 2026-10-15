# STEP 01 - VERIFY

All commands were run on the final tree of the STEP 01 branch.

## Automated

| Command | Result |
|---|---|
| `node scripts/gen.mjs --check` | ok, 14 generated files current |
| `npm run lint` (ESLint, zero warnings) | ok |
| `npm run typecheck` (TypeScript strict) | ok |
| `bash scripts/check-all.sh` (13 guards) | ok |
| `bash scripts/verify/step01-guards.sh` | 45 passed, 0 failed (each guard passes on a clean tree and fails on a seeded violation; ownership rules; commit messages) |
| `npx tsx scripts/verify/step01-core.ts` | 29 passed, 0 failed (Money, uuid v7, hashes, redaction, error shape, container, entitlement, countries, withApi pipeline including idempotency, rate limit, network block, audit enforcement, strict schemas, missing service) |
| `node scripts/verify/step01-tokens.mjs` | ok (WCAG contrast of text pairs in four themes, motion parity with CSS tokens, spacing scale 4/8/12/16/24/32/48/64) |
| `SKIP_ENV_VALIDATION=1 npx next build` | ok; first-load JS 87 to 108 kB (budget 200 kB) |
| `bash scripts/check-bundle-secrets.sh` | ok (no server-only variable name or value in `.next/static`) |
| `bash scripts/db-apply.sh --clean` with a temporary sample migration and assertion | applied, re-applied (idempotent), assertion passed, seeded failing assertion failed the run, temporary database dropped; sample files removed afterwards |
| `bash scripts/integration-check.sh --quick` | ok |

## Boot behaviour (manual)

- `next start` without environment variables: the server refuses to start and prints the variable names with `missing` (no values).
- `next start` with a valid generated environment: starts; boot hooks and service bootstrap run.

## Shells (browser, Chromium)

Pages `/dev/shell-public`, `/dev/shell-auth`, `/dev/shell-dashboard`, `/admin/dev/shell-admin`, `/dev/shell-portal` with `APP_ENV=development SHELL_PREVIEW=1`, at 320, 768 and 1280 px, light and dark: 30 of 30 combinations passed: no horizontal overflow, one `main#main-content`, skip link present, exactly one h1, interactive elements at least 44 x 44 px, input font size at least 16 px, dark class applied, no console errors (404 responses for link prefetches to pages of later STEPs are expected).

Outside development the preview pages show the not-found view (no gallery content); dashboard and admin shells fail closed (HTTP 500 with the error boundary) while the auth service is not registered.

## Not verifiable in STEP 01

- End-to-end behaviour of `withApi` with real services (needs STEPs 02 to 05); covered here with in-memory services.
- Docker image build and CI workflow runs (no Docker daemon or GitHub runner in this session); compose files and workflow YAML were validated for syntax (`docker compose config`, YAML parse).
- Lighthouse scores (no pages with content yet); the budget is configured in `.lighthouserc.json`.
