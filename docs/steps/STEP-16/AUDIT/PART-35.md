<!-- path: docs/steps/STEP-16/AUDIT/PART-35.md -->
# Audit part 35 of 41: features 3367 to 3465

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 59, some-match 22, generic-match 7, no-match 1, manual 10. Features outside every STEP line range: 25.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 3367 | J2 | preload only used glyphs | generic-match | - | lib/security/headers.ts |
| 3368 | J2 | Critical CSS inline above-fold | match | - | scripts/verify/step04-core.ts |
| 3369 | J2 | Third-party defer/async | match | - | config/security.ts |
| 3370 | J3 | Next.js Image AVIF/WebP | match | - | lib/cms/defaults/legal.ts |
| 3371 | J3 | responsive srcset per breakpoint | generic-match | - | components/shared/ui-gallery.tsx |
| 3372 | J3 | lazy-load below-fold | match | - | components/payment/checkout-slot.tsx |
| 3373 | J3 | placeholder LQIP | some-match | - | services/contract/templates.ts |
| 3374 | J3 | CDN automatic Next.js | some-match | - | scripts/verify/step12-adyen.ts |
| 3375 | J4 | invalidation | no-match | - | - |
| 3376 | J4 | ISR public pages | some-match | - | app/layout.tsx |
| 3377 | J4 | CDN static assets 1 year | some-match | - | components/payment/processors/adyen/index.tsx |
| 3378 | J4 | Service Worker PWA offline | generic-match | - | lib/middleware/idempotency.ts |
| 3379 | J4 | HTTP/3 QUIC | some-match | - | scripts/verify/step12-nmi.ts |
| 3380 | J4 | text assets | some-match | - | migrations/S15_007_assets.sql |
| 3381 | J4 | Resource hints preconnect prefetch preload | match | - | app/(dashboard)/payroll/runs/page.tsx |
| 3382 | J5 | N+1 Supabase eager loading | match | - | config/ownership.json |
| 3383 | J5 | monthly | some-match | - | app/sitemap.ts |
| 3384 | J5 | 1000 rows | manual | - | - |
| 3385 | J5 | (Bengali only) | manual | - | - |
| 3386 | J5 | DB statement_timeout 30s | match | - | services/base/transaction.ts |
| 3387 | J5 | 1s | manual | - | - |
| 3388 | J5 | unused index removal | match | - | services/asset/depreciation-rules.ts |
| 3389 | J5 | Materialized view heavy reports | generic-match | - | sql/assertions/s16_033_platform_controls.sql |
| 3390 | J5 | invoices by year future | match | - | lib/reports/ranges.ts |
| 3391 | J5 | Read replica Supabase future | match | - | services/fx/rates.ts |
| 3392 | K1 | numeric 18 4 float money column | match | 02 | scripts/check-migrations.mjs |
| 3393 | K1 | TIMESTAMPTZ UTC | match | 02 | sql/assertions/s16_006_social_schedule.sql |
| 3394 | K1 | UUID v7 time-sortable | some-match | 02 | services/payroll/run-rules.ts |
| 3395 | K1 | partial unique index | match | 02 | sql/assertions/s02_001_foundation.sql |
| 3396 | K1 | enum lookup-table | match | 02 | lib/integrations/mapping-rules.ts |
| 3397 | K1 | negative amounts date ranges | match | 02 | scripts/verify/step16-settlement.ts |
| 3398 | K1 | FK all foreign keys indexed | generic-match | 02 | services/invoice/invoices.ts |
| 3399 | K1 | Postgres FTS pg_trgm full-text fuzzy | match | 02 | migrations/S02_001_foundation.sql |
| 3400 | K1 | deleted_at IS NULL | some-match | 02 | app/global-error.tsx |
| 3401 | K2 | expand-contract | some-match | 02 | components/layout/sidebar.tsx |
| 3402 | K2 | rollback every migration | match | 02 | lib/migration/rules.ts |
| 3403 | K2 | idempotent seed | match | 02 | sql/assertions/s02_007_compliance.sql |
| 3404 | K2 | SemVer | some-match | 02 | sql/assertions/s10_002_credential_vault.sql |
| 3405 | K2 | PR required | some-match | 02 | services/payroll/portal.ts |
| 3406 | K3 | Supabase connection pooling pgBouncer | match | 02 | services/integration/commerce-orders.ts |
| 3407 | K3 | (Bengali only) | manual | 02 | - |
| 3408 | K3 | VACUUM weekly | some-match | 02 | services/payroll/run-rules.ts |
| 3409 | K3 | per table | manual | 02 | - |
| 3410 | K3 | DB-backed queue FOR UPDATE SKIP LOCKED | match | 02 | sql/assertions/s02_006_events_jobs.sql |
| 3411 | L | advisory lock per tenant pg_advisory_lock | match | 02 | migrations/S09_003_numbering.sql |
| 3412 | L | version column editable table | some-match | 02 | services/invoice/invoices.ts |
| 3413 | L | UI Someone else edited this | match | 02 | services/contract/contracts.ts |
| 3414 | L | row lock SELECT FOR UPDATE | some-match | 02 | sql/assertions/s03_lock_state.sql |
| 3415 | L | SERIALIZABLE | some-match | 02 | services/base/transaction.ts |
| 3416 | L | idempotency key | some-match | 02 | lib/middleware/idempotency.ts |
| 3417 | L | form token | some-match | 02 | services/payroll/register.ts |
| 3418 | L | cron pg_advisory_lock | match | 02 | services/base/advisory-lock.ts |
| 3419 | L | processed_events dedup | match | 02 | scripts/verify/step13-disputes.ts |
| 3420 | L | atomic counter | match | 02 | sql/assertions/s04_001_rate_limits.sql |
| 3421 | L | stock deduction lock | match | 02 | services/invoice/send.ts |
| 3422 | L | gapless lock | some-match | 02 | sql/assertions/s03_lock_state.sql |
| 3423 | M | Netlify s sync s background | match | 01 | scripts/build-cron-manifest.mjs |
| 3424 | M | background function async Supabase queue | match | 01 | services/import/imports.ts |
| 3425 | M | raw-body Netlify specific | match | 01 | lib/payment/adapters/custom.ts |
| 3426 | M | MB direct-to-Google-Drive | match | 01 | migrations/S05_003_storage_adapters.sql |
| 3427 | M | async signed URL background job | match | 01 | services/payroll/runs.ts |
| 3428 | M | Netlify Scheduled Functions pg_cron mapping | match | 01 | scripts/build-cron-manifest.mjs |
| 3429 | M | ISR/revalidate Netlify- On-Demand Revalidation | generic-match | 01 | app/(public)/page.tsx |
| 3430 | M | Edge vs Node per route | match | 01 | lib/utils/uuid.ts |
| 3431 | M | connection pooling warm-up | some-match | 01 | scripts/verify/step12-nmi.ts |
| 3432 | M | Netlify Edge Functions A/B geolocation | generic-match | 01 | scripts/build-cron-manifest.mjs |
| 3433 | M | Netlify Forms contact page fallback | match | 01 | services/whatsapp/campaigns.ts |
| 3434 | M | Netlify Vercel Docker CI | match | 01 | app/api/cron/[job]/route.ts |
| 3435 | M | Netlify netlify.toml optimized | match | 01 | config/ownership.json |
| 3436 | M | Netlify preview PR per branch | match | 01 | scripts/netlify-ignore.sh |
| 3437 | N1 | Google Drive primary storage | match | 05 | migrations/S05_003_storage_adapters.sql |
| 3438 | N1 | Google Drive OAuth2 service account | match | 05 | services/storage/drive-link.ts |
| 3439 | N1 | Google Drive Service Account rotation 90-day | match | 05 | migrations/S05_003_storage_adapters.sql |
| 3440 | N1 | Google Drive OAuth refresh token | match | 05 | services/storage/drive-link.ts |
| 3441 | N1 | Google Drive API 1B queries/day | match | 05 | migrations/S05_003_storage_adapters.sql |
| 3442 | N1 | Google Drive rate limit backoff exponential retry | match | 05 | scripts/verify/step05-core.ts |
| 3443 | N1 | Google Drive API temporary Supabase Storage | match | 05 | scripts/verify/step05-core.ts |
| 3444 | N1 | Google Drive storage quota per Service Account 15GB free upgrade | match | 05 | lib/i18n/strings/en/s05-storage.ts |
| 3445 | N1 | Google Workspace vs personal Drive | match | 05 | lib/cms/defaults/legal.ts |
| 3446 | N1 | Google Drive shared drive MyDrive | match | 05 | app/(dashboard)/settings/storage/page.tsx |
| 3447 | N2 | Google Drive | match | 05 | migrations/S05_003_storage_adapters.sql |
| 3448 | N2 | Google Drive resumable | match | 05 | services/storage/migrate.ts |
| 3449 | N2 | presigned URL Google Drive API | match | 05 | services/storage/drive-link.ts |
| 3450 | N2 | signed URL | match | 05 | services/payroll/runs.ts |
| 3451 | N2 | PDF/ | some-match | 05 | services/payroll/run-rules.ts |
| 3452 | N2 | Supabase- name size type hash drive_id | match | 05 | services/storage/files.ts |
| 3453 | N2 | integrity verification checksum | match | 05 | scripts/verify/step12-adyen.ts |
| 3454 | N2 | reconstruction after accidental deletion | some-match | 05 | app/(admin)/admin/users/[id]/page.tsx |
| 3455 | N3 | per tenant plan-based | manual | 05 | - |
| 3456 | N3 | (Bengali only) | manual | 05 | - |
| 3457 | N3 | (Bengali only) | manual | 05 | - |
| 3458 | N3 | block/charge | match | 05 | services/payment/payments.ts |
| 3459 | N3 | Google Drive fail Supabase Storage | match | 05 | services/storage/resolver.ts |
| 3460 | N3 | provider switch | match | 05 | lib/cms/defaults/legal.ts |
| 3461 | N3 | signed URL only | match | 05 | services/payroll/runs.ts |
| 3462 | N3 | per tenant | manual | 05 | - |
| 3463 | N3 | (Bengali only) | manual | 05 | - |
| 3464 | N3 | Google Drive API per tenant | match | 05 | migrations/S05_003_storage_adapters.sql |
| 3465 | N3 | Google Drive migration out plan vendor lock-in avoidance | match | 05 | migrations/S16_009_ocr.sql |
