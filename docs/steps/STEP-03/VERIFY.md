# STEP 03 verification record

Date: 2026-10-16. Branch: claude/clever-goldberg-8ncdae. PostgreSQL 16 (plain, with `supabase/local-shim.sql`).

## A. Automated checks (run in this session)

| Command                                                                                                                                                        | Result                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bash scripts/integration-check.sh` (generators, lint, typecheck, guards, migrations from zero twice, assertions, production build, client bundle secret scan) | ok                                                                                                                                                                                                                                                  |
| `bash scripts/db-apply.sh --clean`                                                                                                                             | 11 migrations applied and re-applied cleanly (S02_001 to S02_008, S03_001 to S03_003)                                                                                                                                                               |
| `bash scripts/run-assertions.sh s03`                                                                                                                           | `s03_001_auth_tables.sql`, `s03_lock_state.sql` ok                                                                                                                                                                                                  |
| `npx tsx scripts/verify/step03-core.ts`                                                                                                                        | 15 checks ok (password policy, strength, history hashes, breach check with a fake network, disposable e-mail, lock identifier, TOTP replay protection, backup codes, step-up, session helpers, OAuth PKCE and host allow list, impersonation rules) |
| `npx tsx scripts/verify/step02-core.ts`                                                                                                                        | ok (still passes)                                                                                                                                                                                                                                   |

`sql/assertions/s03_lock_state.sql` proves the persistence rules of REQ-LOCK in the database: two failures (password, or password plus 2FA, one shared counter) lock for 2 hours; a correct password is refused while locked; no extra counting while locked; no reset token is issued or accepted while locked; a lock start deletes the active reset token; the access token hook and the password hook refuse a locked user; an expired lock starts a fresh counter; a full success resets the counter; a reset token works once; unlock clears the state; unknown identifiers behave exactly like known ones; the functions are closed to `authenticated`. The state is a table row, so a server restart cannot clear it.

## B. Manual script (needs a Supabase project, the Turnstile keys and the STEP 04, 05 services)

The flows below could not be run here: this session has no Supabase project, and the services `security` (STEP 04), `encryption` and `email` (STEP 05) are not merged. Run them after the Integrator merged STEPs 02 to 05 and the owner finished the Supabase steps in HANDOFF.md. Record the result next to each line.

1. Sign up with a new address, an upper/lower/digit/special password of 12+ characters. Expect the neutral message. Open the e-mail, click the link, expect "confirmed".
2. Sign up again with the same address. Expect the identical message and no second e-mail.
3. Sign up with `x@mailinator.com`. Expect "Use a permanent e-mail address."
4. Sign in with a wrong password once, then the correct password. Expect success and the counter back to 0 (`auth_login_state.failure_count`).
5. Sign in with two wrong passwords. Expect the generic message both times and a lock (`locked_until` about 2 hours ahead). Expect the warning e-mail (no link in it). For a staff account the company owner gets one too.
6. Sign in with the correct password while locked. Expect the same generic message. Expect no session.
7. Request a password reset while locked. Expect the neutral message and no e-mail (`reset_suppressed` event). Use an older reset link. Expect "not valid anymore".
8. Change the password from another signed-in session of the same account while locked (not possible by design: sessions end at lock start). Expect no change of `locked_until`.
9. Restart the server. Repeat step 6. Expect the lock to be unchanged.
10. Set up 2FA (QR and manual key), save the 10 backup codes. Sign out, sign in, enter two wrong codes. Expect a lock like step 5. Check that password failures and code failures share the counter (one wrong password, one wrong code = lock).
11. Unknown e-mail: sign in twice, measure the response time of 10 attempts for a known and an unknown address. Expect the same message and times within the jitter (600 ms minimum).
12. Unlock: as an admin_staff member with `auth.account.unlock` do the step-up, request the unlock with a reason. Expect the confirmation e-mail to the account holder. Before the holder confirms, try "Unlock account". Expect "has not confirmed yet". Confirm with the link, then unlock. Expect the account to sign in again, audit entries for the request, the confirmation and the unlock (`/admin/audit`), and the event `auth.account_unlocked`.
13. Use a backup code with "I lost my device": expect 2FA to be reset and the setup page.
14. Sessions: sign in on two browsers; revoke one from the security page; expect the revoked browser to be signed out on the next request. Copy the session cookie into a third browser: expect that session to end (device mismatch).
15. Impersonation: as super_admin do the step-up, start a session for an owner. Expect the yellow banner on every dashboard page, password change disabled, and audit entries that carry the administrator id. End it; expect to be signed out.
16. OAuth: with the provider keys set, sign in with Google and GitHub. Expect: an address that already has an account is not linked silently; linking works only from the security page.
