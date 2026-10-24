# Staging deployment and first-run checklist

Purpose: put the platform on a closed staging site with fake money and fake data and walk every flow once by hand. Nothing here is a production approval. Do not use real customers, real KYC documents or real card data in staging.

Status when this was written: the code builds, passes the guards, and the database layer passes all assertions, but the services, routes and pages have never been run against a real Supabase project, a browser, a mail server or a payment processor. Expect to find defects on the first run and keep a list.

## 1. Accounts to create (all separate from production)

1. A Supabase project for staging (region near your users). Note the project URL, anon key and service-role key.
2. A Netlify site (or the Docker setup in `docker/`) for staging, with Node 22. Set the Functions region next to the Supabase region.
3. A Cloudflare Turnstile widget (site key and secret) for the staging domain.
4. A mail account for SMTP (a test inbox service is fine).
5. Optional: Sentry project, Google OAuth client, GitHub OAuth app.
6. For `APP_ENV=production` later: a network-intelligence provider (IPQualityScore or MaxMind) key. Production refuses to start without it. Staging can run with `NETWORK_INTEL_PROVIDER=none`, but then VPN/proxy/country rules do nothing, so test those rules with a provider key at least once.

## 2. Environment variables

Set them in the Netlify dashboard (never in the repository). `.env.example` lists every name. Required to start:

| Name                                                                                     | How to make it                                                    |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `APP_ENV`                                                                                | `staging`                                                         |
| `NEXT_PUBLIC_APP_URL`                                                                    | the staging address, https                                        |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | from the Supabase project                                         |
| `DATABASE_URL`                                                                           | the Supabase connection string (used by the migration step below) |
| `ENCRYPTION_KEY`                                                                         | `openssl rand -base64 32` (key version 1, never change it)        |
| `AUDIT_SIGNING_KEY`                                                                      | `openssl rand -base64 32`                                         |
| `HMAC_TOKEN_SECRET`                                                                      | at least 43 characters, for example `openssl rand -base64 48`     |
| `CRON_SECRET`                                                                            | at least 32 characters                                            |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`                                 | from Turnstile                                                    |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`                      | from the mail account                                             |
| `CARD_IDENTITY_HMAC_KEY`                                                                 | at least 44 characters, before any card flow is tried             |

`SKIP_ENV_VALIDATION=1` is set in `netlify.toml` for the build only; the running server validates its environment at start and refuses to run with a missing or malformed value. Never set `SKIP_ENV_VALIDATION` on the running site.

Write the keys down in a password manager. Losing `ENCRYPTION_KEY` makes every stored secret and document unreadable.

## 3. Database

1. Apply the migrations of `migrations/S*.sql` (not `*_down.sql`) in file-name order to the staging database, for example `PGDATABASE=<db> bash scripts/db-apply.sh --target` with the libpq variables pointing at Supabase (use the direct connection, not the pooler). The script applies every file twice to prove it is repeatable.
2. `supabase/local-shim.sql` is only for a local test database. Do not apply it to Supabase.
3. Run the assertions only against a throwaway database (`bash scripts/db-apply.sh --clean`); they create test rows.
4. In Supabase, check `Database > Advisors` for security warnings and read them. Migration `S16_018_function_privileges` closes internal functions to the API roles; confirm that signing in still works afterwards (it should; if not, a function a signed-in user needs has no grant).
5. Confirm Row Level Security is on for every table (the advisor flags any table without it).

## 4. Deploy

1. Connect the repository branch to the Netlify site. Build command `npm run build`, Node 22 (already in `netlify.toml`).
2. After the first deploy open `/api/health` (liveness) and `/api/health/ready` (readiness). Both must answer before you go on.
3. Scheduled jobs: the jobs of `cron/schedule.generated.ts` run when something calls `POST /api/cron/<job>` with `Authorization: Bearer <CRON_SECRET>`. Set up the scheduler (a Netlify scheduled function, `pg_cron` with `pg_net`, or a cron on the Docker host) and check that one job answers 200.

## 5. First-run walk (do these in order, write down every failure)

Use a test inbox and fake data.

1. **Sign-up and e-mail.** Create an account, receive the verification mail, verify. Check Turnstile works. Try sign-up from a VPN once (with a provider key set) and confirm it is blocked.
2. **Log-in, lock and 2FA.** Log in; enable 2FA with an authenticator app; log out and in with the code; fail the password twice and confirm the 2-hour lock and the alert mail. Log in as each role you plan to use.
3. **Isolation.** Create a second company. With company A signed in, open a URL that holds an id of company B (invoice, client, gateway case): it must answer 404. This is the most important check; do it for at least ten different pages.
4. **Company and KYC.** Fill the company settings; upload the four KYC documents (a photo under 600 by 400 pixels must be refused; a 6 MB file must be refused); submit; as a platform reviewer start the review and see the screening state (it will say "not completed" until a sanctions list is imported); approve through the approval chain.
5. **Clients, products, invoices.** Create a client, a product, an invoice; send it; open the client link in a private window; download the PDF; check the totals by hand against a calculator (four decimals, USD).
6. **Payments.** Only with the processors you will really use, only with their sandbox keys entered by the super admin in the dashboard. Pay an invoice in sandbox; check the webhook arrived (signature accepted, the same event sent twice changes nothing); refund; check the books.
7. **Files.** Upload a file; with Google Drive linked and not linked; download through the short-lived link.
8. **Gateway.** Make an upstream pointing at a public https test app that you control (for example a small server that verifies the `X-KD-Signature` as in `docs/integrations/gateway.md`); add a route, a sub-merchant, a key; call `/api/gateway/v1/...` with the key; check the app saw the right headers and no key; check a wrong key, a revoked key, a closed sub-merchant, an unknown route.
9. **Sub-merchant KYC.** Make a verification link, open it in a private window, fill, upload, submit; as the owner review and approve; call the gateway again (before approval it must answer 403).
10. **Settlement.** Set terms; post entries by hand and through a settlement key from the test app (post the same batch twice); read the balance; record a payout; try one above the available balance; void it; download the statement.
11. **Cron.** Trigger two or three jobs by hand with the bearer secret; wrong secret must give 401.
12. **Backups.** Take a backup (`scripts/backup.sh`), restore it into a new database (`scripts/restore.sh`), and check the data is there. A backup that was never restored is not a backup.

## 6. Before anything real

- Fix every defect found above and repeat the walk.
- Import the sanctions lists (the official file readers are not built yet; see `docs/compliance/sanctions.md`) or choose a paid screening provider.
- Finish the processor sandbox runs of STEP 11 and 12 for the processors you keep; switch the others off.
- Independent penetration test and code review; fix findings.
- Written decisions with counsel on: holding or moving other people's money, sub-merchant liability, tax, privacy notices, PCI scope, data retention.
- A named person for incidents; read `docs/RUNBOOKS/`; set up alerts and a place for logs (Sentry or the SIEM export).
- Production is a new Supabase project and a new Netlify site with new keys. Never reuse staging keys, and never copy production data into staging.
- Start with a few invited customers and small limits, not a public launch.
