# STEP 01 - HANDOFF

## Summary

STEP 01 is complete: repository scaffold, guard scripts, generators, environment system, core libraries, service container with all cross-STEP contracts, design system, route-group shells, deploy skeleton and documentation. Known issues: none.

## FEATURE_LIST coverage (docs/source/FEATURE_LIST.md)

- Part 1: A1 to A4 (brand, tokens, motion, themes), B (layouts), C (breakpoints, mobile navigation and touch rules, offline banner), D (loading, error, empty, success states), E (navigation map, command palette, shortcuts), F (accessibility basics: skip link, focus ring, contrast, reduced motion, high contrast), H (English-only policy and string centralization), J (consistency rules via guards), L (shared components), M (print styles). Page content (G), illustrations (I, K) belong to STEP 06.
- Part 9: H (supply chain and CI), M (Netlify runtime notes), T (delivery quality gates).
- Part 10: A (deploy and hosting), B (cron job format), C (CI gates), D (documentation baseline), F (domain and email infrastructure notes), H (release and cost operations: deploy gate).
- Part 11: F (dependency and supply chain: Dependabot, Semgrep, gitleaks, Trivy, Checkov in workflows).

## Files created (by area)

- Root configuration: `package.json`, lockfile, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `components.json`, `netlify.toml`, `instrumentation.ts`, `.gitignore`, `.dockerignore`, `.gitleaks.toml`, `.lighthouserc.json`, `.nvmrc`, `.editorconfig`, README, CONTRIBUTING, SECURITY, CHANGELOG, LICENSE, `.env.example` (generated).
- `.github/`: workflows (`ci`, `security`, `deploy`), CODEOWNERS, PR template, Dependabot. `.husky/`: `pre-commit`, `commit-msg`.
- `scripts/`: 13 guard scripts and `check-all.sh`, `check-migrations.mjs`, `check-ownership.mjs`, `check-dead-links.mjs`, `gen.mjs`, `db-apply.sh`, `run-assertions.sh`, `integration-check.sh`, `apply-dependency-requests.sh`, `backup.sh`, `restore.sh`, `deploy.sh`, `make-brand-assets.mjs`, `lib/common.sh`, `verify/step01-{guards.sh,core.ts,tokens.mjs}`.
- `lib/`: `container.ts`, `errors/`, `logger/`, `env/`, `utils/` (Money, uuid v7, hash, date, slug, formatting, motion, cn), `api/with-api.ts`, `entitlement/`, `i18n/`, `providers/`, `hooks/`.
- `types/contracts/` (29 files including `index.ts`), `types/events.ts`, `schemas/common.ts`, `stores/ui-store.ts`.
- `config/`: `design-tokens.json`, `plans.ts`, `countries.ts`, `nav-types.ts`, `ownership.json`, `planned-routes.json`, fragments `nav/s01.ts`, `boot/s01-entitlement.ts`, `env/s01.env.fragment`; generated `nav-map.ts`, `permissions.ts`, `approval-rules.generated.ts`.
- `components/ui/` (24 files), `components/layout/` (shell parts), `components/shared/` (state views, data table, form wrapper, motion, confetti, safe HTML, preview gallery, providers).
- `app/`: root layout, not-found, global error; five route-group layouts with error, loading and not-found; five `/dev/shell-*` preview pages.
- `docker/`, `supabase/` (`config.toml`, `local-shim.sql`), `docs/ADR/0001-0003`, `docs/RUNBOOKS/README.md`, `public/` brand and PWA assets.

## Migrations

None. The migration tooling (`db-apply.sh`, `check-migrations.mjs`, `supabase/local-shim.sql`) is ready for STEP 02.

## Contracts provided

All files in `types/contracts/` (see `docs/execution/CONTRACTS.md`), the service container `lib/container.ts` (with `override` registration), the `entitlement` service (config-based, registered by `config/boot/s01-entitlement.ts`), `withApi`, `Money`, the error classes and the logger.

## Changes to shared documents during STEP 01 (decisions in DECISIONS.md)

- Admin pages moved under `/admin`; dashboard home is `/dashboard`.
- Fragment naming `sNN-` for every fragment; env fragments split into `sNN.ts` (server) and `sNN-public.ts` (browser-visible).
- New contract `idempotency`; contract `security.sanitize` is a deep sanitizer; new `MiddlewareEntry` type.
- `instrumentation.ts` is owned by STEP 01; Sentry joins through `config/boot/s04-*`.
- `components/client` belongs to STEP 13, STEP 08 uses `components/crm`; `app/(admin)/admin/page.tsx` (admin home) belongs to STEP 07.

## Dependency requests

None open. The full planned stack is installed. STEP 12 will request the NMI Payment Component package.

## Environment variables the owner must prepare

See `.env.example`. Required to start: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `HMAC_TOKEN_SECRET`, `AUDIT_SIGNING_KEY`, `CRON_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`. Optional now: SMTP, Google OAuth client, network intelligence provider and key, Sentry.

## What the Integrator must do

1. Merge this branch into `integration` (merge commit).
2. Run `npm ci --ignore-scripts`, `npm run gen`, `bash scripts/integration-check.sh`.
3. Tag `step-01-merged` and push `integration`.
4. After the merge, all other STEPs may start (they branch from `integration`).

## Notes for later STEPs

- STEP 04: block `/dev/*` and `/admin/dev/*` in production; set `x-nonce` (the root layout reads it); provide the `security`, `tokens` and `idempotency` services.
- STEP 03: provide the `auth` service; the shells call `getActor()`.
- STEP 06: provide the public home `/` and the pages linked from the public navigation.
- STEP 09: provide `/dashboard`. STEP 07: provide `/admin`.
- All STEPs: write UI strings in `lib/i18n/strings/en/sNN-<name>.ts` and navigation in `config/nav/sNN.ts`; run `npm run gen` after adding fragments.
