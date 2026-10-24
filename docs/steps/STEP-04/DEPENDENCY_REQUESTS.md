# STEP 04 dependency requests

No new packages. STEP 04 uses packages already in `package.json` (`zod`, `@supabase/supabase-js`, `isomorphic-dompurify`, `@sentry/nextjs`, `@react-email/components`).

For the Integrator (shared files):

1. `instrumentation-client.ts` and an edge Sentry config for browser and edge error reporting, using `scrubSentryEvent` from `lib/security/sentry-scrub.ts` as `beforeSend`. The server side starts from `config/boot/s04-sentry.ts`.
2. Add `node scripts/verify/step04-static.mjs` and `npx tsx scripts/verify/step04-core.ts` to `scripts/integration-check.sh`.
3. `config/ownership.json`: STEP 04 patterns added in this branch: `lib/middleware/shield.ts`, `app/api/security/**`, `emails/security/**`. Keep them.
4. `docs/RUNBOOKS/README.md` (STEP 01): change the row "Security incident response" status from "Written by STEP 04" to "Available: `security-incident-response.md` and four companion runbooks".

For other STEPs: see HANDOFF.md section "Requirements for other STEPs".
