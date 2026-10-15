# STEP 01 - DECISIONS

1. Route collision: route groups share one URL space, so `app/(admin)/<page>` and `app/(dashboard)/<page>` would collide (settings, support, payments, disputes) and both homes would collide with the public home. Decision: admin pages live under `/admin`, the dashboard home is `/dashboard`. All SCOPE files and OWNERSHIP_MAP were updated. (Source: Next.js routing; precedence level 3 does not cover it.)
2. Fragment naming: every fragment is prefixed `sNN-` so that ownership inside shared directories is decided by file name (OWNERSHIP_MAP section 6).
3. `instrumentation.ts` moved from STEP 04 to STEP 01 (fail-fast environment validation and bootstrap run there). STEP 04 adds Sentry through `config/boot/s04-*`.
4. Contract `idempotency` added (STEP 04 implements) because `withApi` needs it for payment and API idempotency.
5. Fonts: the system font stack is used so builds need no network access.
6. `console` is used in exactly one file, `lib/logger/sink.ts`, because the Edge runtime has no `process.stdout`. Guard and ESLint exempt only that file.
7. Rule 17 (approval chain) is implemented by STEP 02 through `lib/auth/approval-rules.ts`; STEP 01 only defines the contract.
8. Preview pages answer with the not-found body outside development, but because `loading.tsx` streams the shell first the HTTP status can be 200. The STEP 04 middleware returns a real 404 for `/dev/*` in production (ADR 0003).
9. `lib/logger/index.ts` exports only browser-safe modules. Server code imports request context helpers from `@/lib/logger/correlation` (it uses `node:async_hooks`).
10. Dead-link guard tolerates links to routes listed in `config/planned-routes.json` (pages of later STEPs). The Release Gate runs it with `--strict`.
11. Touch targets: checkbox and switch hit areas are 44 px; the visible control is smaller.
12. `package.json` pre-installs the planned stack, including `@react-email/components` 1.x and `@react-email/render` 2.x (the 0.0.x line is deprecated upstream).
