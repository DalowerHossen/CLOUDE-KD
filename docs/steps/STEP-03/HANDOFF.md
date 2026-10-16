# STEP 03 handoff - Authentication, Two-Factor and Account Lock

Branch: claude/clever-goldberg-8ncdae (contains STEP 01 and STEP 02).

## FEATURE_LIST items implemented (docs/source/FEATURE_LIST.md numbering)

- A1 basic auth: 376-398 (e-mail/password, branded screens, verification and resend, 24 hour link, forgot and reset with 1 hour token, strength indicator, rules, show/hide, remember me, Turnstile, role redirect, session refresh and timeout, logout single and all). Account deactivate/reactivate (397-398) are not built here.
- A2 OAuth: 399-400, 403-404, 405, 408, 409-410 (Google and GitHub, callback, linking, unlinking). Admin provider configuration screens (401-402, 406-407) are not built; providers are configured by environment variables and the feature flag `auth.oauth.<provider>`.
- A3 two-factor: 411-419, 420 (owner only), 421-422 (step-up), 423 (reminder on the security page), 424 (mandatory per role). WebAuthn and biometrics (425-426) are future-ready only.
- A4 sessions: 427-432, 433 (SameSite=Lax by decision D3), 435 (platform end time), 437-439.
- A5 login security: 440 (the owner changed the rule to 2 failures = 2 hours: REQ-LOCK), 442 (IP failure limit), 443, 444, 445, 446, 447, 449.
- Part 7 2846-2854 impersonation; Part 9 3850-3890 brute force (the parts that belong to authentication); Part 11 4574-4580 account fraud prevention (device and address change events).

## Migrations

| File                | Content                                                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S03_001_auth_tables | `auth_login_state`, `auth_login_events` (append-only), `auth_unlock_requests`, `password_history`, `two_factor_factors`, `backup_codes`, `user_sessions`, `user_devices`, `oauth_identities`, `impersonation_sessions`; own-row read policies with column-level grants; `kd_revoke_user_sessions` |
| S03_002_lock_engine | lock functions `kd_lock_check`, `kd_lock_record_failure`, `kd_lock_record_success`, `kd_lock_unlock`, reset token functions, `kd_ip_failures`, Auth Hook functions `kd_auth_access_token_hook`, `kd_auth_password_hook`, `kd_auth_mfa_hook`                                                       |
| S03_003_step_up     | `user_sessions.step_up_at`, `kd_revoke_session`                                                                                                                                                                                                                                                   |

All tables have RLS enabled and forced; writes only through the service role.

## Contract implemented

`auth` (`services/auth/auth-service.ts`, registered by `services/auth/register.ts`): `getActor` (verifies the Supabase user, the platform session record, end time, revocation, device binding and address change on every request), `requireRole`, `requireStepUp` (password plus 2FA code, 300 seconds, stored on the session), `lockState`.

## Config keys (`config/auth-lock.ts`)

`LOCK_THRESHOLD=2`, `LOCK_DURATION_SECONDS=7200`, `IP_FAILURE_LIMIT=10`, `IP_FAILURE_WINDOW_SECONDS=900`, `OWNER_2FA_GRACE_DAYS=7`, `BACKUP_CODE_COUNT=10`, `TOTP_PERIOD_SECONDS`, `TOTP_WINDOW_STEPS`, `PASSWORD_MIN_LENGTH=12`, `PASSWORD_MAX_LENGTH`, `PASSWORD_HISTORY_DEPTH=5`, `SESSION_TIMEOUT_SECONDS=86400`, `REMEMBER_ME_SECONDS` (30 days), `STEP_UP_DEFAULT_SECONDS=300`, `EMAIL_VERIFICATION_TTL_SECONDS`, `PASSWORD_RESET_TTL_SECONDS=3600`, `UNLOCK_CONFIRMATION_TTL_SECONDS`, `IMPERSONATION_MAX_SECONDS=3600`, `LOGIN_MIN_RESPONSE_MS=600`, `LOGIN_CAPTCHA_AFTER_FAILURES=3`.

## Environment variables

New: `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` (optional, `config/env/s03.env.fragment`, `lib/env/s03.ts`). Used from STEP 01: `HMAC_TOKEN_SECRET` (lock identifier hash, device hash, backup code hash, signed cookies), `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_APP_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## E-mail templates created (`emails/auth/`, catalogue `emails/auth/index.ts`)

`auth.account-locked`, `auth.verify-email`, `auth.reset-password`, `auth.unlock-confirmation`, `auth.new-device`, `auth.password-changed`. STEP 05 must render the React components from `authEmailTemplates` and honour `EmailService.send({ template, to, data, idempotencyKey })`. `config/boot/s03-email-templates.ts` registers the definitions when the e-mail service exists.

## Pages and APIs

- Pages: `/login`, `/login/two-factor`, `/login/two-factor-setup`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/unlock/confirm`, `/oauth/callback/[provider]` (group `(auth)`, no analytics scripts); `/account/security`; `/admin/account-locks`; `/admin/impersonation`.
- APIs under `/api/auth/`: `login`, `logout`, `signup`, `verify-email`, `resend-verification`, `forgot-password`, `reset-password`, `step-up`, `sessions` (+ `revoke`, `revoke-others`), `password/change`, `2fa/verify`, `2fa/setup/{begin,confirm}`, `2fa/enroll/{begin,confirm}`, `2fa/backup-codes`, `2fa/disable`, `oauth/[provider]/{start,callback}`, `oauth/unlink`, `unlock/confirm`, `impersonation/end`. Admin: `/api/admin/account-locks` (+ `request`, `[id]/unlock`), `/api/admin/impersonation` (+ `start`).
- Permissions (`config/permissions/s03-auth.ts`): `auth.account.read`, `auth.account.unlock`, `auth.impersonate`, `auth.session.read`, `auth.session.revoke`. `admin_staff` needs the sub-role `support_agent` for the `auth` domain (`SUB_ROLE_DOMAINS` in `lib/auth/roles.ts`, one line added to the STEP 02 file).
- Domain events published: `auth.account_locked`, `auth.account_unlocked`, `auth.new_device`.
- Login event types are listed in `services/auth/login-events.ts`.

## What the owner must do in Supabase (REQ-LOCK item 8, DECISIONS D1)

1. Authentication > Providers > Email: keep Email on, turn "Confirm email" on, set the Email OTP expiration to 86400 seconds (the verification link). Turn public sign-ups off (accounts are created by the platform API).
2. Authentication > Hooks: add the Custom Access Token hook, type Postgres function, `public.kd_auth_access_token_hook`. This works on every plan and stops token issue and refresh for a locked account, so direct calls to Supabase Auth are not a bypass.
3. If the project is on Teams or Enterprise: also add the Password Verification Attempt hook (`public.kd_auth_password_hook`) and the MFA Verification Attempt hook (`public.kd_auth_mfa_hook`).
4. Confirm the hook behaviour and plan limits on the current official pages listed in DECISIONS D1 (this session could not open `supabase.com`).
5. Set the JWT signing keys to the asymmetric option in Authentication > JWT Keys when available (feature list: asymmetric JWT where supported).
6. Platform users (super_admin, ceo, admin_staff) are created by a seed or admin script with `app_metadata = { "role": "<role>" }`, a row in `profiles` (`platform_role`, optional `admin_sub_role`) and no company.
7. Register at Google and GitHub the redirect URIs `<NEXT_PUBLIC_APP_URL>/oauth/callback/google` and `/oauth/callback/github`.

## Requirements for other STEPs

- STEP 04 (security): the content security policy must allow `https://challenges.cloudflare.com` (script, frame) and `img-src data:` (the 2FA QR code). The rate limit policy name `api-default` is used by `withApi`. A CSRF/origin check must protect the JSON POST routes (DECISIONS D3).
- STEP 05 (encryption, email): `encryption.encrypt('pii', seed, userId)` for TOTP seeds and `encrypt('oauth-tokens', ...)` for provider tokens; e-mail templates above.
- Every page of the `(dashboard)` and `(admin)` groups should call `getService('auth').getActor()` through `getShellContext` (STEP 01 shell) so unauthenticated visitors reach `/login`. `components/layout/shell-user.ts` already fails closed when the service is missing.

## Files outside STEP 03 ownership that were changed

| File                                                                                                                                                                                             | Change                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `app/(dashboard)/layout.tsx` (STEP 01)                                                                                                                                                           | mounts `ImpersonationBanner`              |
| `lib/auth/roles.ts` (STEP 02)                                                                                                                                                                    | `support_agent` domain list gained `auth` |
| generated barrels (`config/nav-map.ts`, `config/permissions.ts`, `lib/boot.generated.ts`, `lib/bootstrap.generated.ts`, `lib/env/schema.generated.ts`, `lib/i18n/strings/en.ts`, `.env.example`) | regenerated by `npm run gen`              |

## Known issues

- The sign-in, sign-up, reset, 2FA, OAuth, unlock and impersonation flows are compiled, type-checked and covered by the database assertions and pure-logic checks, but they have not been run against a live Supabase project (no project, and the services of STEP 04 and 05 are not merged). VERIFY.md section B lists the manual run.
- The Supabase documentation could not be opened (host denied); the hook decisions are based on search summaries of the official pages and must be confirmed (DECISIONS D1).
- Ending an impersonation signs the browser out; the administrator signs in again.
- A new account holder has 7 days (owner) before 2FA is forced; staff and platform roles are forced at the first sign-in.
- Account deactivation and reactivation (feature 397, 398) and the admin OAuth provider screens (401, 402, 406, 407) are not part of this build.

## What the Integrator must run

1. Merge this branch (merge commit), then `npm run gen` and commit the result.
2. `bash scripts/db-apply.sh --clean` and `bash scripts/run-assertions.sh all`; `bash scripts/integration-check.sh`.
3. Register the e-mail templates in STEP 05, then run VERIFY.md section B.
4. Tag `step-03-merged`.
