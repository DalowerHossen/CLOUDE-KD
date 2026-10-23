# KD SOLUTION IT

Enterprise multi-tenant SaaS platform for invoicing, payments, payroll and accounting, built for the Asia-Pacific market (secondary market: United States).

## Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Tailwind CSS, shadcn/ui, Supabase (PostgreSQL, Auth, RLS, Realtime, pg_cron), Google Drive API (optional per-company file storage), 16 pluggable payment processor adapters, universal SMTP email, WhatsApp Meta Cloud API, Netlify (primary) and Docker/VPS (alternative), Sentry, Cloudflare Turnstile.

## How the project is built

The work is split into 16 STEPs. One STEP is built in one chat; every STEP is divided into sub-steps before code is written. Read these files first:

| File | Purpose |
|---|---|
| `CLAUDE.md` | Rules loaded in every chat (20 absolute rules, branch policy, scope discipline) |
| `docs/execution/STEP_PROTOCOL.md` | The procedure every STEP follows |
| `docs/execution/OWNERSHIP_MAP.md` | Which STEP owns which paths and tables |
| `docs/execution/CONTRACTS.md` | Interfaces between STEPs |
| `docs/execution/REQUIREMENTS_SPEC.md` | Formal requirements (login lock, card rules, processors, storage) |
| `docs/execution/PAYMENT_PROCESSORS.md` | The 16 processors and the documentation rule |
| `docs/steps/STEP-NN/SCOPE.md` | Scope of each STEP |
| `docs/execution/INTEGRATION_CHECKLIST.md` | How STEPs are merged into `integration` |

`integration` is the main branch.

## Getting started

```bash
nvm use                       # Node 22
npm ci --ignore-scripts
cp .env.example .env.local    # fill in the values (see comments in the file)
npm run gen                   # generates barrels from fragments
npm run dev
```

Development preview of the shared interface elements: set `APP_ENV=development` and `SHELL_PREVIEW=1`, then open `/dev/shell-public`, `/dev/shell-auth`, `/dev/shell-dashboard`, `/admin/dev/shell-admin` and `/dev/shell-portal`.

## Commands

| Command | What it does |
|---|---|
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript |
| `npm run gen` / `node scripts/gen.mjs --check` | Generate or verify generated files |
| `npm run check` | All guard scripts (language, tests, markers, path comments, any, console, card data, brand names, money, secrets, migrations, dead links) |
| `bash scripts/integration-check.sh [--quick]` | Merge check |
| `bash scripts/db-apply.sh --clean` | Apply all migrations to a fresh database and run SQL assertions |
| `npm run verify:step01` | Verification of the STEP 01 libraries and guards |

## Rules in short

English only in code and UI. USD only, `numeric(18,4)`, never JavaScript Number for money. No test files. No unfinished markers. No `any`. No console output. Every table has RLS and audit. Details: `CLAUDE.md`.
