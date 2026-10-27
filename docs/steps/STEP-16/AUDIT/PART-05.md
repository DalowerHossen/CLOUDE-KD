<!-- path: docs/steps/STEP-16/AUDIT/PART-05.md -->
# Audit part 5 of 41: features 397 to 495

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 44, some-match 29, generic-match 4, no-match 1, manual 21. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 397 | A1 | self-service | some-match | 03 | scripts/verify/step16-automation.ts |
| 398 | A1 | within grace period | match | 03 | config/auth-lock.ts |
| 399 | A2 | Google OAuth Sign in with Google | match | 03 | lib/i18n/strings/en/s03-auth.ts |
| 400 | A2 | GitHub OAuth Sign in with GitHub | match | 03 | services/auth/oauth-flow.ts |
| 401 | A2 | OAuth admin panel | match | 03 | app/(dashboard)/account/security/page.tsx |
| 402 | A2 | OAuth ID/ | some-match | 03 | config/s16-social.ts |
| 403 | A2 | OAuth callback error/success | match | 03 | services/bankfeed/connections.ts |
| 404 | A2 | OAuth existing email link OAuth | match | 03 | services/storage/drive-link.ts |
| 405 | A2 | OAuth | some-match | 03 | config/s16-social.ts |
| 406 | A2 | OAuth enable/disable admin | match | 03 | lib/i18n/strings/en/s03-auth.ts |
| 407 | A2 | OAuth login page | match | 03 | config/s16-social.ts |
| 408 | A2 | Or continue with login form | match | 03 | services/fraud/reaction.ts |
| 409 | A2 | OAuth | some-match | 03 | config/s16-social.ts |
| 410 | A2 | OAuth | some-match | 03 | config/s16-social.ts |
| 411 | A3 | 2FA super_admin owner staff | manual | 03 | - |
| 412 | A3 | TOTP Time-based One-Time Password | match | 03 | config/auth-lock.ts |
| 413 | A3 | 2FA QR code scan | some-match | 03 | scripts/integration-check.sh |
| 414 | A3 | 2FA QR Authenticator app compatible | generic-match | 03 | lib/cms/defaults/home.ts |
| 415 | A3 | 2FA QR scan | some-match | 03 | scripts/integration-check.sh |
| 416 | A3 | 2FA login- | some-match | 03 | scripts/verify/step16-tenant-insight.ts |
| 417 | A3 | 2FA 10 codes one-time use | some-match | 03 | services/payroll/run-rules.ts |
| 418 | A3 | 2FA | manual | 03 | - |
| 419 | A3 | 2FA backup code reset 2FA | match | 03 | config/auth-lock.ts |
| 420 | A3 | 2FA disable owner only with confirmation | match | 03 | lib/i18n/strings/en/s03-auth.ts |
| 421 | A3 | super_admin 2FA | manual | 03 | - |
| 422 | A3 | step-up 2FA gateway change payout | match | 03 | app/(admin)/admin/setup/_components/setup-wizard.tsx |
| 423 | A3 | 2FA setup not done prompt | match | 03 | scripts/verify/step12-nmi.ts |
| 424 | A3 | 2FA owner staff per tenant | manual | 03 | - |
| 425 | A3 | WebAuthn/FIDO2 future-ready | match | 03 | components/payment/checkout-panel.tsx |
| 426 | A3 | mobile future-ready | match | 03 | scripts/verify/step16-gateway-kyc.ts |
| 427 | A4 | device browser IP location | match | 03 | lib/cms/defaults/legal.ts |
| 428 | A4 | last active created at | some-match | 03 | services/payroll/run-rules.ts |
| 429 | A4 | (Bengali only) | manual | 03 | - |
| 430 | A4 | except current | match | 03 | services/checkout/sessions.ts |
| 431 | A4 | rotate session ID on login | match | 03 | services/auth/session-ops.ts |
| 432 | A4 | (Bengali only) | manual | 03 | - |
| 433 | A4 | HttpOnly Secure SameSite Strict | match | 03 | services/cms/legal.ts |
| 434 | A4 | per tenant | manual | 03 | - |
| 435 | A4 | configurable timer | some-match | 03 | services/project/time.ts |
| 436 | A4 | per plan | manual | 03 | - |
| 437 | A4 | email | manual | 03 | - |
| 438 | A4 | unusual IP/location | generic-match | 03 | services/auth/actor.ts |
| 439 | A4 | IP change mid-session | match | 03 | services/auth/session-service.ts |
| 440 | A5 | 2 failed 60 min lock | match | 03 | services/ocr/jobs.ts |
| 441 | A5 | lock duration increases | match | 03 | services/fraud/reaction.ts |
| 442 | A5 | too many logins per hour | match | 03 | sql/assertions/s03_lock_state.sql |
| 443 | A5 | IP- | manual | 03 | - |
| 444 | A5 | signup | some-match | 03 | app/(admin)/admin/analytics/page.tsx |
| 445 | A5 | HIBP API integration | generic-match | 03 | services/auth/password-hash.ts |
| 446 | A5 | min length complexity | match | 03 | lib/company/sections.ts |
| 447 | A5 | last 5 passwords block | match | 03 | app/(admin)/admin/_components/people-actions.tsx |
| 448 | A5 | identity verification | match | 03 | scripts/verify/step12-nmi.ts |
| 449 | A5 | audit trail | some-match | 03 | app/api/public-site/legal/accept/route.ts |
| 450 | A5 | optional | some-match | 03 | services/payroll/run-rules.ts |
| 451 | B1 | SMTP any provider | match | 05 | migrations/S05_006_email.sql |
| 452 | B1 | SMTP one-click setup | match | 05 | migrations/S05_006_email.sql |
| 453 | B1 | SMTP any host/port/credentials | match | 05 | services/email/settings.ts |
| 454 | B1 | SMTP | some-match | 05 | migrations/S05_006_email.sql |
| 455 | B1 | SMTP send test email | match | 05 | migrations/S05_006_email.sql |
| 456 | B1 | SMTP connection status | match | 05 | services/email/settings.ts |
| 457 | B1 | SMTP primary fail secondary tertiary | match | 05 | scripts/verify/step05-core.ts |
| 458 | B1 | SMTP daily/monthly limits | match | 05 | migrations/S05_006_email.sql |
| 459 | B1 | SMTP 80 95 100 | some-match | 05 | migrations/S05_006_email.sql |
| 460 | B1 | SMTP one-click zero downtime | some-match | 05 | migrations/S05_006_email.sql |
| 461 | B1 | SMTP all sent emails status errors | some-match | 05 | migrations/S05_006_email.sql |
| 462 | B1 | SMTP retry bounce block | match | 05 | migrations/S05_006_email.sql |
| 463 | B1 | SMTP per second/minute | match | 05 | migrations/S05_006_email.sql |
| 464 | B1 | SMTP OAuth-based providers | match | 05 | lib/env/s01.ts |
| 465 | B2 | SMTP optional per tenant | match | 05 | lib/i18n/strings/en/s07-company.ts |
| 466 | B2 | SMTP default | some-match | 05 | migrations/S05_006_email.sql |
| 467 | B2 | From Name per tenant | manual | 05 | - |
| 468 | B2 | From Email per tenant verified domain | match | 05 | sql/assertions/s07_005_domains.sql |
| 469 | B2 | Reply-To per tenant | some-match | 05 | scripts/verify/step12-nmi.ts |
| 470 | B2 | SPF/DKIM/DMARC per domain | match | 05 | lib/email/dns.ts |
| 471 | B2 | DNS check | some-match | 05 | scripts/verify/step05-core.ts |
| 472 | B2 | (Bengali only) | manual | 05 | - |
| 473 | B2 | per plan | manual | 05 | - |
| 474 | B2 | ramp-up period | generic-match | 05 | config/email.ts |
| 475 | B2 | SMTP platform custom | some-match | 05 | migrations/S05_006_email.sql |
| 476 | B3 | SPF | some-match | 05 | lib/email/dns.ts |
| 477 | B3 | DKIM | some-match | 05 | lib/email/dns.ts |
| 478 | B3 | DMARC | some-match | 05 | lib/email/dns.ts |
| 479 | B3 | hard/soft | match | 05 | migrations/S05_006_email.sql |
| 480 | B3 | auto manual | manual | 05 | - |
| 481 | B3 | FBL | no-match | 05 | - |
| 482 | B3 | (Bengali only) | manual | 05 | - |
| 483 | B3 | multipart | some-match | 05 | lib/storage/adapters/google-drive.ts |
| 484 | B3 | RFC 8058 | some-match | 05 | lib/auth/oauth.ts |
| 485 | B3 | (Bengali only) | manual | 05 | - |
| 486 | B3 | (Bengali only) | manual | 05 | - |
| 487 | B3 | (Bengali only) | manual | 05 | - |
| 488 | B3 | pixel-based | some-match | 05 | app/(admin)/admin/analytics/page.tsx |
| 489 | B3 | (Bengali only) | manual | 05 | - |
| 490 | B3 | sent/delivered/opened/clicked/bounced | match | 05 | migrations/S05_006_email.sql |
| 491 | C1 | Free pre-selected | match | 07 | lib/email/content.ts |
| 492 | C1 | auto-activate | some-match | 07 | app/(dashboard)/payroll/settings/page.tsx |
| 493 | C1 | No credit card required | match | 07 | scripts/verify/step14-ledger.sh |
| 494 | C1 | (Bengali only) | manual | 07 | - |
| 495 | C1 | (Bengali only) | manual | 07 | - |
