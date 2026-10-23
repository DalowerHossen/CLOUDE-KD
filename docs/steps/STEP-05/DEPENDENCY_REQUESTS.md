# STEP 05 dependency requests

No new packages. STEP 05 uses packages already in `package.json`: `@googleapis/drive` (types only are not needed; Drive is called over HTTPS), `nodemailer`, `sharp`, `pdf-lib`, `isomorphic-dompurify`, `@react-email/components`, `@react-email/render`, `jose`.

For the Integrator (shared files):

1. `config/ownership.json`: STEP 05 patterns added in this branch: `workers/notifications/**`, `services/encryption/**`, `components/storage/**`, `lib/notifications/**`, `config/{email,notifications,storage}.ts`, `app/api/admin/{storage,emails}/**`. Please also add them to `docs/execution/OWNERSHIP_MAP.md` row 05.
2. `config/security.ts` (STEP 04): STEP 05 added the rate policies `upload` (30 a minute) and `download` (60 a minute).
3. `lib/middleware/csrf.ts` and `lib/middleware/bot-detector.ts` (STEP 04): STEP 05 added `/api/email/webhooks/`, `/api/email/unsubscribe/`, `/api/email/track/` to the server-to-server lists.
4. `scripts/verify/step04-static.mjs`: allows the plain handlers of STEP 05 (binary and redirect routes). Add `step05-core.ts` and `step05-files.ts` to `scripts/integration-check.sh`.
5. `components/layout/topbar.tsx` (STEP 01): show the unread count on the bell and offer a bell for platform staff (an `admin-notifications` item plus a page). The data comes from `GET /api/notifications` (`unread`).
6. Each STEP that adds an e-mail catalogue `emails/<name>/index.ts` adds one line to `emails/catalog.ts`.
7. The Google Cloud OAuth client used for sign-in (STEP 03) needs one more authorized redirect URI: `<NEXT_PUBLIC_APP_URL>/api/storage/drive/callback`, and the Drive API must be enabled in the project.

For other STEPs: see HANDOFF.md section "Requirements for other STEPs".
