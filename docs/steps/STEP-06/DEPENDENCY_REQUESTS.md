# STEP 06 dependency requests

No new packages. STEP 06 uses packages already in `package.json`: `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`, `isomorphic-dompurify`, `decimal.js` (through `lib/utils/currency.ts`), `@react-email/components`, `next/og`, `framer-motion` (existing confetti).

For the Integrator (shared files, all already changed in this branch where noted):

1. `config/ownership.json`: STEP 06 patterns added: `lib/cms/**`, `config/seo.ts`, `config/marketing.ts`, `lib/{blog,marketing,support}/**`, `services/{analytics,help}/**`, `app/api/{analytics,marketing}/**`, `app/.well-known/**`. Please also add them to `docs/execution/OWNERSHIP_MAP.md` row 06. Note: `services/support/**` belongs to STEP 07, so the help and status services live in `services/help/`.
2. Files of other STEPs touched in this branch (small, documented): `app/(public)/layout.tsx` (STEP 01 shell, replaced by the public frame; `app/(public)/loading.tsx` was removed so missing pages answer 404, see DECISIONS D17), `emails/catalog.ts` (one line for the marketing catalogue), `scripts/verify/step04-static.mjs` (plain-handler allow list for the media, share image and RSS-style routes and the JSON-LD component). Generated files changed by `npm run gen`: `config/nav-map.ts`, `config/permissions.ts`, `config/approval-rules.generated.ts`, `cron/schedule.generated.ts`, `lib/env/schema.generated.ts`, `lib/i18n/strings/en.ts`, `.env.example`.
3. `eslint.config.mjs` and `scripts/verify/step04-static.mjs`: allow `dangerouslySetInnerHTML` in `components/marketing/json-ld.tsx` (JSON-LD data block with escaped text). Today it uses one inline lint exception and one entry in `DANGEROUS_INNER_HTML`.
4. `lib/security/csp.ts` and `lib/middleware/headers.ts` (STEP 01/04): for public paths, add the origins returned by `originsFor(activeProviders(...))` (`lib/analytics/providers.ts`) to `connect-src` and `img-src`, only when the `kd_consent` cookie allows the provider's category. Until then the providers load but cannot send data (safe failure). Payment, token, sign-in, portal and admin paths must keep the current strict policy.
5. `lib/auth/roles.ts` (`SUB_ROLE_DOMAINS`): the content manager covers content, cms, blog, help. Add `seo`, `analytics`, `marketing` and `leads` if content managers should see those screens; otherwise only the CEO, super admin and (for read actions) admin staff reach them.
6. `scripts/integration-check.sh`: add `npx tsx scripts/verify/step06-core.ts`, `npx tsx scripts/verify/step06-seo.ts` and `node scripts/verify/step06-scripts.mjs`.
7. `components/layout/*` (STEP 01): the `Logo` and theme toggle are reused by the public frame; no change needed.
8. Netlify: the new routes `/.well-known/security.txt`, `/sitemap.xml`, `/robots.txt` and `/blog/rss.xml` must not be rewritten to a static fallback; no `netlify.toml` change is needed in a standard Next.js deploy.

For other STEPs: see HANDOFF.md section "For other STEPs".
