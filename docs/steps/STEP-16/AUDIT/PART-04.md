<!-- path: docs/steps/STEP-16/AUDIT/PART-04.md -->
# Audit part 4 of 41: features 298 to 396

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 17, some-match 31, generic-match 8, no-match 6, manual 37. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 298 | H4 | UI hidden feature-flagged | generic-match | 01 | app/(dashboard)/suppliers/[id]/statement/page.tsx |
| 299 | H4 | (Bengali only) | manual | 01 | - |
| 300 | H4 | (Bengali only) | manual | 01 | - |
| 301 | I1 | subtle | some-match | 06 | lib/utils/hash.ts |
| 302 | I1 | (Bengali only) | manual | 06 | - |
| 303 | I1 | status feedback | some-match | 06 | lib/helpdesk/opinion.ts |
| 304 | I1 | 3D icons/badges subtle depth | some-match | 06 | components/layout/sidebar.tsx |
| 305 | I1 | interactive elements | some-match | 06 | app/not-found.tsx |
| 306 | I1 | glow effects | some-match | 06 | components/client/pay-panel.tsx |
| 307 | I1 | hero sections | match | 06 | lib/i18n/strings/en/s06-public.ts |
| 308 | I1 | optional muted | match | 06 | app/(admin)/admin/_components/modules-panel.tsx |
| 309 | I2 | Dribbble- Recharts customized | some-match | 06 | components/charts/sent-vs-paid-chart.tsx |
| 310 | I2 | tooltips zoom | generic-match | 06 | styles/tokens.generated.css |
| 311 | I2 | on load | some-match | 06 | app/global-error.tsx |
| 312 | I2 | inline | some-match | 06 | components/layout/sidebar.tsx |
| 313 | I2 | (Bengali only) | manual | 06 | - |
| 314 | I2 | conversion | some-match | 06 | sql/assertions/s06_007_marketing.sql |
| 315 | I2 | projects | some-match | 06 | app/(dashboard)/dashboard/page.tsx |
| 316 | I2 | (Bengali only) | manual | 06 | - |
| 317 | I3 | subtle fun elements | generic-match | 06 | lib/utils/hash.ts |
| 318 | I3 | (Bengali only) | manual | 06 | - |
| 319 | I3 | (Bengali only) | manual | 06 | - |
| 320 | I3 | What s new new feature announcement | some-match | 06 | migrations/S07_008_admin_ops_down.sql |
| 321 | I3 | good morning/afternoon | match | 06 | scripts/verify/step16-social-schedule.ts |
| 322 | J1 | (Bengali only) | manual | 01 | - |
| 323 | J1 | (Bengali only) | manual | 01 | - |
| 324 | J1 | primary/secondary/ghost/destructive | match | 01 | components/shared/ui-gallery.tsx |
| 325 | J1 | sm/md/lg | manual | 01 | - |
| 326 | J1 | (Bengali only) | manual | 01 | - |
| 327 | J1 | (Bengali only) | manual | 01 | - |
| 328 | J1 | (Bengali only) | manual | 01 | - |
| 329 | J2 | per tenant preference | some-match | 01 | app/api/notifications/route.ts |
| 330 | J2 | (Bengali only) | manual | 01 | - |
| 331 | J2 | USD base display options | match | 01 | scripts/verify/step12-nmi.ts |
| 332 | J2 | per user | manual | 01 | - |
| 333 | J2 | (Bengali only) | manual | 01 | - |
| 334 | J2 | (Bengali only) | manual | 01 | - |
| 335 | J3 | CI | manual | 01 | - |
| 336 | J3 | Playwright | some-match | 01 | lib/middleware/bot-detector.ts |
| 337 | J3 | Storybook optional | some-match | 01 | services/payroll/run-rules.ts |
| 338 | J3 | every component | some-match | 01 | app/not-found.tsx |
| 339 | J3 | 320px every page | manual | 01 | - |
| 340 | J3 | every printable page | some-match | 01 | lib/payment/health-rules.ts |
| 341 | K1 | (Bengali only) | manual | 06 | - |
| 342 | K1 | (Bengali only) | manual | 06 | - |
| 343 | K1 | (Bengali only) | manual | 06 | - |
| 344 | K1 | (Bengali only) | manual | 06 | - |
| 345 | K1 | (Bengali only) | manual | 06 | - |
| 346 | K1 | SVG scalable themeable | some-match | 06 | components/marketing/art/illustrations.tsx |
| 347 | K1 | (Bengali only) | manual | 06 | - |
| 348 | K2 | Next.js Image | some-match | 06 | lib/middleware/bot-detector.ts |
| 349 | K2 | responsive srcset | some-match | 06 | components/shared/ui-gallery.tsx |
| 350 | K2 | AVIF/WebP | generic-match | 06 | scripts/check-no-coming-soon.sh |
| 351 | K2 | lazy-load | match | 06 | components/payment/checkout-slot.tsx |
| 352 | K2 | placeholder | some-match | 06 | services/contract/templates.ts |
| 353 | K2 | CDN automatic | some-match | 06 | scripts/verify/step12-adyen.ts |
| 354 | L1 | CMS-editable | generic-match | 01,06 | app/robots.ts |
| 355 | L1 | admin-editable | some-match | 01,06 | services/invoice/invoices.ts |
| 356 | L1 | (Bengali only) | manual | 01,06 | - |
| 357 | L1 | future | some-match | 01,06 | services/social/schedules.ts |
| 358 | L1 | version info | some-match | 01,06 | services/payroll/portal.ts |
| 359 | L1 | SSL GDPR etc. | generic-match | 01,06 | services/email/settings-store.ts |
| 360 | L1 | dynamic year | some-match | 01,06 | services/payroll/run-rules.ts |
| 361 | L2 | centralized | no-match | 01,06 | - |
| 362 | L2 | centralized | no-match | 01,06 | - |
| 363 | L2 | centralized | no-match | 01,06 | - |
| 364 | L2 | (Bengali only) | manual | 01,06 | - |
| 365 | L2 | (Bengali only) | manual | 01,06 | - |
| 366 | L2 | (Bengali only) | manual | 01,06 | - |
| 367 | L2 | status/count | some-match | 01,06 | services/payroll/run-rules.ts |
| 368 | L2 | initials/image fallback | match | 01,06 | components/ui/avatar.tsx |
| 369 | L2 | removable | no-match | 01,06 | - |
| 370 | L2 | (Bengali only) | manual | 01,06 | - |
| 371 | M1 | invoice/report | generic-match | 01 | services/payroll/run-rules.ts |
| 372 | M1 | page CSS | some-match | 01 | scripts/check-path-comment.sh |
| 373 | M1 | media print | match | 01 | lib/i18n/strings/en/s06-public.ts |
| 374 | M1 | (Bengali only) | manual | 01 | - |
| 375 | M1 | UI hide | some-match | 01 | app/(dashboard)/suppliers/[id]/page.tsx |
| 376 | A1 | Supabase | some-match | 03 | services/payroll/runs.ts |
| 377 | A1 | KD SOLUTION IT branding | match | 03 | lib/i18n/strings/en/s07-company.ts |
| 378 | A1 | signup verify email active | match | 03 | lib/i18n/strings/en/s03-auth.ts |
| 379 | A1 | (Bengali only) | manual | 03 | - |
| 380 | A1 | (Bengali only) | manual | 03 | - |
| 381 | A1 | email reset link new password | match | 03 | app/(admin)/admin/users/[id]/page.tsx |
| 382 | A1 | (Bengali only) | manual | 03 | - |
| 383 | A1 | real-time visual | no-match | 03 | - |
| 384 | A1 | min 8 chars upper lower number special | match | 03 | migrations/S15_010_payroll_people.sql |
| 385 | A1 | (Bengali only) | manual | 03 | - |
| 386 | A1 | Remember me secure 30 days | match | 03 | lib/cms/defaults/legal.ts |
| 387 | A1 | Cloudflare Turnstile after 3 failed attempts | match | 03 | config/auth-lock.ts |
| 388 | A1 | Cloudflare Turnstile always | match | 03 | config/auth-lock.ts |
| 389 | A1 | (Bengali only) | manual | 03 | - |
| 390 | A1 | SMTP welcome/verify/reset emails | match | 03 | lib/i18n/strings/en/s07-company.ts |
| 391 | A1 | login appropriate dashboard | match | 03 | components/layout/shell-user.ts |
| 392 | A1 | unauthenticated login | generic-match | 03 | lib/payment/health-rules.ts |
| 393 | A1 | auto silent | some-match | 03 | components/marketing/easter-egg.tsx |
| 394 | A1 | configurable default 24h | no-match | 03 | - |
| 395 | A1 | single device | some-match | 03 | migrations/S04_003_signals_down.sql |
| 396 | A1 | (Bengali only) | manual | 03 | - |
