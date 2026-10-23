# KD SOLUTION IT - Session Instructions (loaded automatically in every chat)

This file is ASCII-only English. It applies to every chat that works on this repository.

## 1. Project

KD SOLUTION IT is an enterprise multi-tenant SaaS platform for invoicing, payments, payroll and accounting for the Asian market. The work is split into 16 STEPS. One STEP is built in one chat. Each STEP is split into small SUB-STEPS before any code is written.

## 2. Source of truth and precedence

When two sources disagree on the same topic, the higher one wins. Record every such decision in `docs/steps/STEP-NN/DECISIONS.md`.

1. `docs/source/REQUIREMENTS_ADDENDUM.md` (newest owner instructions, verbatim)
2. `docs/execution/REQUIREMENTS_SPEC.md` (formal English version of the addendum)
3. `docs/source/MASTER_PROMPT.md`
4. `docs/source/FEATURE_LIST.md` (feature numbers 1 to 4029, written in Bengali; the UI stays English)

## 3. First actions in every chat (mandatory, in this order)

1. Identify the STEP number from the user's message. If it is missing, ask for it and stop.
2. Read this file.
3. Read `docs/execution/STEP_PROTOCOL.md`.
4. Read `docs/execution/OWNERSHIP_MAP.md` and `docs/execution/CONTRACTS.md`.
5. Read `docs/execution/REQUIREMENTS_SPEC.md`.
6. Read `docs/steps/STEP-NN/SCOPE.md` and, if it exists, `PROGRESS.md`.
7. For STEPs 10 to 12 also read `docs/execution/PAYMENT_PROCESSORS.md`.
8. Read only the FEATURE_LIST line ranges that SCOPE.md lists for this STEP.
9. Start from the latest `origin/integration`. Work only on the branch that this session designates.

## 4. The 20 absolute rules (never violate)

1. English ONLY - zero Bengali/Hindi/Chinese in code, UI, comments, seeds. (Exempt directories: `docs/bn/`, `docs/source/`.)
2. USD ONLY - all money in numeric(18,4); never use JavaScript Number for money (use decimal.js through `lib/utils/currency.ts`).
3. Text data go to Supabase PostgreSQL. Files go to the company's linked Google Drive (AES-256-GCM encrypted) or, when no Drive is linked, to Supabase Storage (also encrypted). See REQUIREMENTS_SPEC REQ-STORAGE.
4. NO test files (`*.test.ts`, `*.spec.ts`, `tests/`). Verification uses `scripts/verify/`, `sql/assertions/` and `docs/steps/STEP-NN/VERIFY.md`.
5. NO TODO, NO FIXME, NO "Coming Soon", NO placeholder text.
6. NO `any` types - TypeScript strict mode everywhere.
7. NO console.log - use the structured logger.
8. Every source file starts with `// path: <file-path>` (SQL files start with `-- path: <file-path>`).
9. Every DB table has: id (UUID v7), company_id, created_at, updated_at, deleted_at (company_id is nullable only for platform-level tables).
10. Every table has RLS enabled with a default-deny policy.
11. Every mutation writes an audit log entry.
12. Every API has Zod validation (client and server, strict mode).
13. Every input is sanitized (XSS, SQL injection, CSRF prevention).
14. Every payment has an idempotency key.
15. Every editable record has optimistic locking (version column).
16. Roles: super_admin > ceo > admin_staff > owner > staff. A client has no login (tokenized links only).
17. Actions go through the approval chain (staff -> CEO -> super_admin) according to `lib/auth/approval-rules.ts`.
18. Payment partner names: NEVER write bKash, Nagad, GCash, UPI or similar brands. Use "Global Payout Partners" or "Local Payment Methods via Licensed Partners".
19. Zero Trust + Zero Tolerance security on everything.
20. VPN/Proxy/Tor detection and blocking on signup, payment, KYC and admin.

## 5. Tech stack (fixed)

Next.js 16 (App Router; the former middleware file is `proxy.ts`), React 19, Node.js 22, TypeScript strict, Tailwind CSS, shadcn/ui, Supabase (PostgreSQL, Auth, RLS, Realtime, pg_cron), Google Drive API, payment processors through pluggable adapters (16 processors, see PAYMENT_PROCESSORS.md), universal SMTP email, WhatsApp Meta Cloud API, Netlify (primary) and Docker/VPS (alternative), Sentry, Cloudflare Turnstile, DOMPurify, nonce-based CSP.

## 6. Branch policy

- `integration` is the main line of the project. All finished work ends up there.
- A STEP chat commits only to the branch designated for the session, based on the latest `origin/integration`.
- Only the Integrator session merges into `integration` (see `docs/execution/INTEGRATION_CHECKLIST.md`).
- Never force-push. Never rewrite history. Never push to another branch without explicit permission.
- Commit after every SUB-STEP and again at STEP closure. Conventional commits: `feat(stepNN): <sub-step id> <summary>`.

## 7. Scope discipline (prevents conflicts and duplicates)

- Write only inside the paths that `OWNERSHIP_MAP.md` assigns to your STEP.
- Shared files (package.json, lockfile, tsconfig, next.config.js, netlify.toml, middleware chain, barrels, `.env.example`, `types/database.ts`) belong to the Integrator. Use the fragment files and request files described in OWNERSHIP_MAP.md.
- Cross-STEP calls go only through the interfaces in `types/contracts/` and the service container `lib/container.ts`.
- If a needed contract is missing or unclear, write `docs/steps/STEP-NN/BLOCKERS.md`, stop that sub-step, and tell the user. Never invent a cross-STEP interface.
- Never implement a feature that belongs to another STEP, even partially.

## 8. Payment processor rule

Before writing any code for a payment processor, read that processor's latest official documentation from the internet in the current session (WebFetch/WebSearch). Never write processor code from memory or assumption. If the documentation cannot be reached, stop and report. See PAYMENT_PROCESSORS.md.

## 9. Security stance

Zero Trust (never trust, always verify) and Zero Tolerance (see FEATURE_LIST part 11 section L2). Every sub-step must pass the security checklist in STEP_PROTOCOL.md section 6 before it is committed.

## 10. Working style

- Do exactly what the STEP asks. Add no extra commentary and no extra features.
- When the user asks only for a plan, write no code.
- Final reply of every chat: the sub-steps completed, the commit list, the handoff file path, and the next action for the user.
