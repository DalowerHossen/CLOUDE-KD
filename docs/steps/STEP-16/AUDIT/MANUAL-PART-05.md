<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-05.md -->
# Manual reading, part 5 (features 397 to 495, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. Results: present, partial, not found, check in browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 411 | Two-step verification for everyone | present | `mustSetUpTwoFactor` in `services/auth/login-flow.ts`: every role but owner at once, owners after a grace period |
| 418 | Regenerate backup codes | present | `/api/auth/2fa/backup-codes`, `services/auth/two-factor-service.ts` |
| 421 | Mandatory two-step check on super admin actions | present | `stepUp` on the platform routes (`lib/api/with-api.ts`); the confirm window is new |
| 424 | Owner enforces two-step for staff, per tenant | partial | the setting `requireTwoFactor` is saved (`lib/company/sections.ts`) but nothing reads it at sign-in (STEP 07 left it to STEP 03, never done); platform staff roles are forced anyway |
| 429 | Revoke a single session | present | `/api/auth/sessions/revoke` |
| 432 | Password change ends all sessions | present | `kd_revoke_user_sessions` in `services/auth/password-service.ts` |
| 434 | Session timeout setting per tenant | partial | `staffSessionTimeoutMinutes` is saved but nothing reads it; `isIdleTooLong` in `lib/auth/session.ts` takes a platform limit |
| 436 | Concurrent session limit per plan | not found | |
| 437 | New-device login e-mail | present | template `auth.new-device` (seen in the live outbox) |
| 443 | IP-based login rate limit | present | `lib/middleware/rate-limit.ts`, the login route |
| 467 | Custom From name per tenant | present | e-mail settings `from_name` (`services/email/settings-store.ts`) |
| 472 | E-mail deliverability score | partial | STEP 05 decision D33: the score is the SPF, DKIM and DMARC check result of sub-step 05.7b, not a number |
| 473 | Tenant sending limit per plan | present | `companyDailyLimit` in `services/email/sender.ts` |
| 480 | Suppression list, automatic and manual | partial | table and automatic entries exist; whether the settings page lets a person add one needs a look in the browser |
| 482 | Spam score pre-check | present | `scanContent` in `lib/email/content.ts` |
| 485 | No sending before the e-mail is verified | not built by design | STEP 05 decision D33: the verification message itself must reach an unverified address and the contract has no flag |
| 486 | Phishing and spam content scan | present | `lib/email/content.ts` |
| 487 | Link domain allow list | present | `EXTRA_LINK_HOSTS` in `services/email/template-admin.ts` |
| 489 | E-mail click tracking | present | `/api/email/track/click/[token]/[index]` |
| 494 | Company name on the sign-up form | present | `app/(auth)/_components/signup-form.tsx` |
| 495 | Industry select on the sign-up form | not found | the form has no industry; the onboarding wizard asks for it later |

## Not built: 436, 495 (485 by design). Partly built: 424, 434, 472, 480. Features 424, 434 and 472 were first marked differently and corrected after reading the STEP decisions and searching for who reads the setting.
