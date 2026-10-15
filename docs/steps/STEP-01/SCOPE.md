# STEP 01 - Foundation, Contracts and Guardrails

Wave A (runs alone first). Role: builds the base that every other STEP depends on. Depends on: nothing. Provides: repository scaffold, guard scripts, generators, container, contracts, design system base, route-group shells, CI/deploy skeleton.

## Feature sources (docs/source/FEATURE_LIST.md)
- Part 1 lines 25-76 (A brand, design tokens, motion, themes), 77-112 (B layouts), 113-163 (C breakpoints, mobile), 164-206 (D states), 207-233 (E navigation), 234-265 (F accessibility), 345-377 (H language policy), 404-427 (J consistency), 445-465 (L shared components), 466-471 (M print)
- Part 9 lines 3954-3969 (H supply chain and CI), 4062-4076 (M Netlify runtime), 4263-4275 (T delivery gates)
- Part 10 lines 4276-4435 (A deploy, B cron list format, C CI gates, D documentation, F domain and email infrastructure, H release and cost operations)
- Part 11 lines 4624-4649 (F dependency and supply chain)
- MASTER_PROMPT: project structure, code quality standards, naming, forbidden practices

## Owned paths
See OWNERSHIP_MAP.md section 3, row 01. Migrations: none. (Database helpers come in STEP 02.)

## Sub-steps
- 01.1 Scaffold: Next.js 14 App Router, TypeScript strict (noImplicitAny, noUnusedLocals, noUnusedParameters, strictNullChecks), ESLint (no-restricted-syntax for non-ASCII, no `any`, no console, explicit return types), Prettier, Husky (pre-commit, commit-msg with conventional commits), `.gitignore`, `.dockerignore`, folder skeleton from the master structure (with `.gitkeep` only).
- 01.2 Dependency baseline: `package.json` with the complete planned stack (Next, React, Tailwind, shadcn/Radix, Lucide, Framer Motion, React Hook Form, Zod, TanStack Query, Zustand, Recharts, Tiptap, DOMPurify, @react-pdf/renderer, decimal.js, @supabase/supabase-js and ssr, otplib, qrcode, nodemailer and provider SDK-free HTTP clients, googleapis, sharp, pdf-lib, fast-xml-parser, safe-regex, jose, @noble/ed25519, React Email, Sentry). Lockfile. `scripts/apply-dependency-requests.sh`.
- 01.3 Guard scripts (each exits non-zero on violation): check-english-only (excludes `docs/bn/` and `docs/source/`), check-no-tests, check-no-todo, check-no-coming-soon, check-path-comment, check-no-any, check-no-console, check-no-pan, check-no-brand-names (rule 18), check-money (no float arithmetic in money code), check-migrations (naming, down file, RLS, required columns, UUID v7), check-ownership, check-dead-links, check-secrets (gitleaks config), `check-all.sh`, `integration-check.sh`, `db-apply.sh`, `run-assertions.sh`.
- 01.4 CI/CD skeleton: `.github/workflows/{ci,security,deploy}.yml` (lint, typecheck, build, guards, Semgrep, gitleaks, dependency audit, Lighthouse CI config; no deploy on Friday after 15:00), CODEOWNERS mirroring OWNERSHIP_MAP, PR template, Dependabot.
- 01.5 Environment system: Zod env loader with fail-fast boot, fragment mechanism (`config/env/<step>.env.fragment`, `lib/env/<domain>.ts`), generated `.env.example`, per-environment separation notes. Initial fragments: Supabase, ENCRYPTION_KEY, HMAC token secret, audit signing key, Turnstile, SMTP, Google OAuth client (Drive link), network-intelligence key, Sentry.
- 01.6 Core libraries: `lib/errors/` (ValidationError, NotFoundError, UnauthorizedError, ForbiddenError, ConflictError, DuplicateError, RateLimitError, ServiceNotRegisteredError), `lib/logger/` (structured JSON, PII redaction, correlation id), `lib/utils/` (currency/Money with decimal.js, date UTC, hash, slug, formatting), `lib/api/withApi.ts` (pipeline from CONTRACTS.md), standard error response shape `{ error: { code, message, details, correlation_id } }`.
- 01.7 Container and contracts: `lib/container.ts`; every file in `types/contracts/` as listed in CONTRACTS.md including `payment-adapter.ts`; `types/events.ts`; baseline `config/plans.ts` and a config-based entitlement evaluator registered as service `entitlement`.
- 01.8 Generators: `scripts/gen.sh` builds i18n barrel, nav-map, permissions barrel, env example and schema, cron schedule, bootstrap, middleware chain, processor adapters index. Add `npm run gen`.
- 01.9 Design system base: tokens (spacing 4/8/12/16/24/32/48/64, radius, shadow, z-index, motion, typography, color roles) as CSS variables and Tailwind config, light/dark/high-contrast themes, shadcn/ui base components, Lucide, Framer Motion presets with reduced-motion, skip link, focus ring, logo component and favicon pack.
- 01.10 Shells and states: root layouts for `(public)`, `(auth)`, `(dashboard)`, `(admin)`, `(client-portal)`; sidebar, topbar, mobile drawer, bottom navigation (5 items), breadcrumbs from nav-map, command palette, keyboard shortcuts page shell, skeleton/empty/error/success components, offline banner, `not-found.tsx`, `error.tsx`, `loading.tsx`, form wrapper with double-submit protection, shared data table with mobile card mode.
- 01.11 Deploy skeleton: `netlify.toml`, `docker/` (Dockerfile, compose, compose.prod, nginx), `supabase/config.toml`, `scripts/{backup,restore,deploy}.sh`, `instrumentation.ts` hook point.
- 01.12 Documentation and branch: README, CONTRIBUTING, SECURITY, CHANGELOG, LICENSE (Proprietary), `docs/ADR/0001-contracts-and-ownership.md`, `docs/ADR/0002-migration-ordering.md`, `docs/RUNBOOKS/README.md`. Ensure branch `integration` exists and equals the merged result.

## Security notes
Nothing is public by default; `withApi()` fails closed when a required service is missing. Secrets never appear in the client bundle (guard script scans the build output). No card-field handling anywhere (`check-no-pan`).

## Verification
`npm run gen && npm run lint && npm run typecheck && npm run build` pass. `scripts/check-all.sh` passes on the repository and fails on seeded violation files (the check scripts are exercised through `scripts/verify/step01-selfcheck.sh`, which creates temporary violation files outside the source tree). Every route group renders its shell at 320px, 768px and 1280px in light and dark themes. `integration` branch pushed.

## Handoff must list
Every contract file, every generator, every guard script, the env variable names, the initial dependency list.
