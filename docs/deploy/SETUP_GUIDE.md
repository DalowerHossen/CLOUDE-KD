# Setup guide: Git, Supabase, Netlify, keys and the first super admin

Written from the code and configuration of this repository. The dashboards of Supabase and Netlify change their menus often and could not be opened while writing this; if a label differs, look for the same word nearby and compare with the current official documentation.

## 1. Git

- Repository: `DalowerHossen/CLOUDE-KD`. Work is on the branch `claude/clever-goldberg-8ncdae`; the rules of the project say the Integrator merges finished work into `integration`. Decide which branch Netlify builds (see section 4).
- Nothing secret is stored in Git: `.env.example` has names only, and the guards (`scripts/check-secrets.sh`, gitleaks) check this.

## 2. Supabase

1. **Create the project.** Choose a region close to your users and to the Netlify Functions region. Write down the database password.
2. **API values** (Project settings > API): the project URL, the anon (public) key and the service-role (secret) key. The code reads them as `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. If the dashboard shows only new-style "publishable" and "secret" keys, look for the "legacy API keys" tab: this code was written for the anon and service-role JWT keys. The service-role key bypasses every row-level rule; it goes only into the Netlify server environment and the command that creates the first super admin, never into the browser or Git.
3. **Apply the migrations** from your computer, with `psql` installed:
   ```
   export PGHOST=db.<project-ref>.supabase.co PGPORT=5432 PGUSER=postgres PGPASSWORD='<database password>' PGDATABASE=postgres PGSSLMODE=require
   bash scripts/db-apply.sh --target
   ```
   It applies every `migrations/S*.sql` (not the `_down` files) in order, twice. If the direct host does not resolve (some plans have IPv6 only), use the "session pooler" connection string of the same page. The migrations were tested on a plain PostgreSQL with a small stand-in for Supabase (`supabase/local-shim.sql`); this is their first run on a real Supabase project, so read any error and stop at the first one.
   **Without psql on your computer:** run the GitHub workflow `deploy-supabase` (Actions > deploy-supabase > Run workflow). Before the first run create a GitHub Environment (`staging` or `production`; Settings > Environments) with the secret `SUPABASE_DB_URL`: the Supabase "Session pooler" connection string with the real database password (GitHub runners cannot reach the IPv6-only direct host). Type `APPLY` to confirm. The workflow applies every migration and fails if a table lacks row level security or the sign-in hook function is missing.
4. **Authentication settings** (Authentication in the dashboard; these come from `docs/steps/STEP-03/HANDOFF.md`):
   - Email provider on, "Confirm email" on, e-mail OTP expiry 86400 seconds, public sign-ups off (the platform creates accounts through its own API).
   - Hooks: add the "Custom Access Token" hook of type Postgres function `public.kd_auth_access_token_hook`. On Teams or Enterprise plans also add `public.kd_auth_password_hook` and `public.kd_auth_mfa_hook`.
   - URL configuration: Site URL = your `NEXT_PUBLIC_APP_URL`; add the same address (and `/**`) to the redirect URLs.
   - JWT keys: choose the asymmetric option when it is offered.
5. **Storage.** Nothing to create: the private bucket is made by the platform on first use. Files are stored encrypted.
6. **Check** `Database > Advisors` (security) and that Row Level Security is on for all tables.

## 3. Keys you generate yourself

Run these on your computer (macOS/Linux; on Windows use WSL or Git Bash). Each value is secret. Store them in a password manager; losing `ENCRYPTION_KEY` makes stored secrets and documents unreadable, and it must never be changed once data exists.

| Name                     | Command                   | Rule                       |
| ------------------------ | ------------------------- | -------------------------- |
| `ENCRYPTION_KEY`         | `openssl rand -base64 32` | exactly 32 bytes in base64 |
| `AUDIT_SIGNING_KEY`      | `openssl rand -base64 32` | 32 bytes in base64         |
| `HMAC_TOKEN_SECRET`      | `openssl rand -base64 48` | at least 43 characters     |
| `CRON_SECRET`            | `openssl rand -hex 32`    | at least 32 characters     |
| `CARD_IDENTITY_HMAC_KEY` | `openssl rand -base64 48` | at least 44 characters     |

Keys that other services give you: Supabase (section 2), Cloudflare Turnstile site key and secret, your mail provider's SMTP host, port, user, password and from-address, and later a network-intelligence key (IPQualityScore or MaxMind), which is required when `APP_ENV=production`.

Payment processor keys are not environment variables: the super admin enters them in the dashboard and they are stored encrypted with `ENCRYPTION_KEY`.

## 4. Netlify

1. Add a new site from Git, choose the repository and the branch to build. The build command (`npm run build`), Node 22 and the build flags are already in `netlify.toml`.
2. Site configuration > Environment variables: add every name from section 3 and the Supabase and mail values, plus `APP_ENV=staging` (or `production` later) and `NEXT_PUBLIC_APP_URL` = the final address of the site (the `*.netlify.app` address, or your own domain). Variables that start with `NEXT_PUBLIC_` are baked in at build time: set them before the build and rebuild after changing them. Mark the secret ones as secret values.
3. Deploy. Open `/api/health` and `/api/health/ready`.
4. If you change the address (custom domain), change `NEXT_PUBLIC_APP_URL`, the Supabase Site URL and redirect URLs, the Turnstile domain and any OAuth redirect together, then redeploy.
5. Scheduled jobs are not started by Netlify from this repository: there is no scheduled function in it. Something must call `POST https://<site>/api/cron/<job>` with `Authorization: Bearer <CRON_SECRET>` for each job of `cron/schedule.generated.ts` at the schedule written in its file (about 69 jobs; many run every minute or every 5 minutes). Choose a scheduler (a GitHub Actions cron, an external cron service, or Supabase `pg_cron` with `pg_net`) and set it up before you rely on e-mail queues, webhook retries, expiry notices or the other background work.

## 5. The first super admin

There are no default accounts. Create the first one once, from your computer, after the migrations are applied and the Supabase authentication settings above are done:

```
export NEXT_PUBLIC_SUPABASE_URL='https://<project-ref>.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='<service-role key>'
read -s PLATFORM_USER_PASSWORD && export PLATFORM_USER_PASSWORD   # type the password, it is not shown
node scripts/create-platform-user.mjs --email you@yourdomain.com --name "Your Name" --role super_admin
```

The password needs 12 to 128 characters with an upper-case letter, a lower-case letter, a digit and a special character, and must not contain the first part of the e-mail address. Check the input first with `--dry-run`. The script creates the Supabase account (already confirmed, role `super_admin` in its app metadata) and the `profiles` row without a company; if the row cannot be written it removes the account again. It prints no secret.

Then open `https://<site>/login`, sign in with that e-mail and password. Platform users cannot postpone two-factor sign-in: you are taken to the set-up page, scan the QR code with an authenticator app and keep the backup codes. After that the admin area (`/admin`) is available. Make the CEO and staff accounts with the same script (`--role ceo`, or `--role admin_staff --sub-role kyc_reviewer`), or in the admin pages.

Use a personal address you control for the first super admin and keep a second super admin account in reserve in a safe place, because a lost authenticator and lost backup codes lock the account out.

## 6. Order of work

1. Supabase project and settings (section 2, items 1, 2, 4).
2. Generate the keys (section 3) and store them.
3. Apply the migrations (section 2, item 3).
4. Netlify site, environment variables, deploy (section 4).
5. Set `NEXT_PUBLIC_APP_URL` and the Supabase URLs to the final address; redeploy.
6. Create the first super admin (section 5) and sign in.
7. Walk `docs/deploy/STAGING_CHECKLIST.md` section 5.
