# STEP 03 - Authentication, Two-Factor and Account Lock

Wave B. Depends on: STEP 01. Contract use: tenant, audit, permissions, approval, security, email, encryption (all through the container). Provides contract: auth.

## Feature sources
- Part 2 lines 473-554 (A auth, OAuth, 2FA, sessions, login security), 935-946 (K tenant security policy: session and 2FA enforcement parts only)
- Part 7 lines 2846-2854 (A3 impersonation)
- Part 9 lines 3850-3890 (D brute force, abuse)
- Part 11 lines 4574-4580 (account fraud prevention), 4854-4882 (zero trust, zero tolerance: session parts)
- REQUIREMENTS_SPEC: REQ-LOCK, REQ-ROLES, REQ-APPROVAL

## Owned paths and migrations
OWNERSHIP_MAP.md rows 03 and section 4. Migration block `S03_*`. Config file `config/auth-lock.ts` (also owned here).

## Sub-steps
- 03.1 Documentation check: read the current Supabase documentation for Auth, MFA and Auth Hooks (password verification hook, MFA verification hook) and record findings in `DECISIONS.md` (REQ-LOCK item 8).
- 03.2 Auth tables and policies: `auth_login_state`, `auth_login_events`, `auth_unlock_requests`, `password_history`, `two_factor_factors`, `backup_codes`, `user_sessions`, `user_devices`, `oauth_identities`, `impersonation_sessions`.
- 03.3 Sign-up, email verification, login, logout, forgot and reset flows: pages in `(auth)`, APIs in `app/api/auth/`, Turnstile and honeypot via the security contract, disposable-email block, password policy (12+ characters, upper, lower, digit, special), HIBP k-anonymity check, last 5 passwords blocked, uniform generic error and equalized timing.
- 03.4 Lock engine (REQ-LOCK 1-3, 5-7): HMAC-keyed counters, shared counter for password and 2FA failures, 2 failures = 2 hours lock, reset only on full login, reset flow disabled while locked, password change cannot unlock, owner alert email (plus company owner for staff accounts), IP rate limit through the security contract, lock enforced at the auth server through Auth Hooks when 03.1 confirms support.
- 03.5 Two-factor: TOTP enrollment with QR and manual code, 10 one-time backup codes (hashed), recovery by backup code, mandatory for all account-holding roles (owner within `OWNER_2FA_GRACE_DAYS`, default 7, config), 2FA failures feed the lock engine, step-up service (`requireStepUp`: TOTP plus password re-entry, default 300 seconds).
- 03.6 Sessions: asymmetric JWT where supported, HttpOnly + Secure cookies (SameSite=Lax with CSRF token because of OAuth and processor return redirects; the decision is recorded), session id rotation on login, configurable timeout (default 24 hours), device list, revoke one or all, mid-session IP or device change detection event, new-device and unusual-IP login notifications, staff session revoke by owner.
- 03.7 OAuth: Google and GitHub, tokens encrypted through the encryption contract, safe account linking, state and PKCE.
- 03.8 Unlock workflow (REQ-LOCK 4): admin page `(admin)/admin/account-locks`, permission `auth.account.unlock`, unlock request -> confirmation message to the account owner's registered email -> owner confirms -> unlock allowed -> counters reset -> audit entries at each stage, `account_unlocked` event.
- 03.9 Impersonation: super_admin only, step-up required, time-limited, banner on every page, all actions marked in the audit log, `(admin)/admin/impersonation`.
- 03.10 Account security page `(dashboard)/account/security`: 2FA status, backup codes regeneration, sessions, devices, password change with history check.

## Security notes
Lock state never lives in memory. Messages never reveal whether an account exists. Auth pages carry no analytics scripts. Reset tokens are single use and invalidated at lock start.

## Verification
Manual script `docs/steps/STEP-03/VERIFY.md`: two wrong passwords -> locked; correct password still refused; reset email not sent; password change leaves lock; restart server (state kept); wrong 2FA twice -> locked; unknown email gives identical response and time; unlock flow end to end with audit entries; SQL assertion `s03_lock_state.sql` for persistence.

## Handoff must list
Auth contract implementation, config keys, email templates created, Supabase hook configuration steps for the owner.
