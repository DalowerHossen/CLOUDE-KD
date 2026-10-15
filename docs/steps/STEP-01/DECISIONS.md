# STEP 01 - DECISIONS

1. Route collision: route groups share one URL space, so `app/(admin)/<page>` and `app/(dashboard)/<page>` would collide (settings, support, payments, disputes) and both homes would collide with the public home. Decision: admin pages live under `/admin`, the dashboard home is `/dashboard`. All SCOPE files and OWNERSHIP_MAP were updated. (Source: Next.js routing; precedence level 3 does not cover it.)
2. Fragment naming: every fragment is prefixed `sNN-` so that ownership inside shared directories is decided by file name (OWNERSHIP_MAP section 6).
3. `instrumentation.ts` moved from STEP 04 to STEP 01 (fail-fast environment validation and bootstrap run there). STEP 04 adds Sentry through `config/boot/s04-*`.
4. Contract `idempotency` added (STEP 04 implements) because `withApi` needs it for payment and API idempotency.
5. Fonts: the system font stack is used so builds need no network access.
6. `console` is used in exactly one file, `lib/logger/sink.ts`, because the Edge runtime has no `process.stdout`. Guard and ESLint exempt only that file.
7. Rule 17 (approval chain) is implemented by STEP 02 through `lib/auth/approval-rules.ts`; STEP 01 only defines the contract.
