<!-- path: docs/steps/STEP-16/AUDIT/PART-36.md -->
# Audit part 36 of 41: features 3466 to 3564

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 47, some-match 24, generic-match 11, no-match 1, manual 16. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 3466 | N3 | Google Drive- data residency compliance | match | 05 | migrations/S02_002_tenancy.sql |
| 3467 | N3 | Google Drive token leak detection | match | 05 | migrations/S05_003_storage_adapters.sql |
| 3468 | N4 | content hash | match | 05 | services/estimate/public.ts |
| 3469 | N4 | per document | some-match | 05 | scripts/verify/step16-automation.ts |
| 3470 | N4 | cron weekly | match | 05 | services/lifecycle/data.ts |
| 3471 | N4 | cold storage | some-match | 05 | scripts/verify/step16-automation.ts |
| 3472 | N4 | per file type | some-match | 05 | services/payroll/run-rules.ts |
| 3473 | N4 | 30 days | some-match | 05 | services/payroll/run-rules.ts |
| 3474 | N4 | (Bengali only) | manual | 05 | - |
| 3475 | N4 | name type date tenant | some-match | 05 | services/payroll/run-rules.ts |
| 3476 | N4 | Google Drive deletion recovery 30-day trash | match | 05 | lib/cms/defaults/help.ts |
| 3477 | O | AVIF/WebP | generic-match | 05 | scripts/check-no-coming-soon.sh |
| 3478 | O | EXIF/GPS privacy all uploads | match | 05 | scripts/verify/step05-files.ts |
| 3479 | O | thumb/md/full | some-match | 05 | components/ui/scroll-area.tsx |
| 3480 | O | srcset responsive images | generic-match | 05 | components/shared/ui-gallery.tsx |
| 3481 | O | PDF only used glyphs | match | 05 | lib/pdf/shared/fonts.ts |
| 3482 | O | PDF DPI | some-match | 05 | services/payroll/run-rules.ts |
| 3483 | O | PDF | some-match | 05 | services/payroll/run-rules.ts |
| 3484 | O | KYC/ OCR- | match | 05 | config/features.ts |
| 3485 | O | CSV/JSON gzip/brotli | match | 05 | scripts/verify/step16-settlement.ts |
| 3486 | O | ZIP | some-match | 05 | scripts/verify/step12-nmi.ts |
| 3487 | O | (Bengali only) | manual | 05 | - |
| 3488 | O | low/medium/high/auto | match | 05 | scripts/verify/step14-settlement.ts |
| 3489 | O | export files configurable | some-match | 05 | services/payroll/run-rules.ts |
| 3490 | O | CDN aggressive | some-match | 05 | scripts/verify/step12-adyen.ts |
| 3491 | P1 | CDN Singapore/Tokyo edge | generic-match | 09,14 | scripts/verify/step12-adyen.ts |
| 3492 | P1 | Singapore/Mumbai/Tokyo region | match | 09,14 | lib/compliance/jurisdictions.ts |
| 3493 | P1 | Supabase Singapore | generic-match | 09,14 | services/payroll/runs.ts |
| 3494 | P1 | Google Drive | match | 09,14 | migrations/S05_003_storage_adapters.sql |
| 3495 | P1 | (Bengali only) | manual | 09,14 | - |
| 3496 | P1 | onboarding local company badges | match | 09,14 | app/(dashboard)/hr/checklists/page.tsx |
| 3497 | P2 | 12+ timezones ICT/IST/CST/JST/KST/PST/AWST/SGT/MYT/ICT/PKT/BDT | generic-match | 09,14 | app/(dashboard)/account/profile/page.tsx |
| 3498 | P2 | Lunar/Buddhist/Islamic calendar display | some-match | 09,14 | services/payroll/run-rules.ts |
| 3499 | P2 | country-wise auto-populate | generic-match | 09,14 | scripts/verify/step12-nmi.ts |
| 3500 | P2 | per country due date adjustment | match | 09,14 | lib/i18n/strings/en/s09-invoicing.ts |
| 3501 | P2 | 24h default for most Asia | some-match | 09,14 | scripts/verify/step16-modules.ts |
| 3502 | P3 | Indian lakh/crore style display option | generic-match | 09,14 | config/countries.ts |
| 3503 | P3 | country-specific China postcode Japan India PIN BD ZIP | match | 09,14 | lib/tax/templates.ts |
| 3504 | P3 | country code auto-detect 86/+91/+880/+66/+81/+65 | match | 09,14 | services/fraud/signals.ts |
| 3505 | P3 | last-name-first for East Asia title handling | match | 09,14 | scripts/verify/step09-core.ts |
| 3506 | P3 | formal address honorifics | some-match | 09,14 | services/payroll/register.ts |
| 3507 | P4 | GST India 18 SST Malaysia 6 VAT Vietnam 10 | match | 09,14 | lib/tax/templates.ts |
| 3508 | P4 | fapiao China GST India e-invoicing | match | 09,14 | lib/tax/templates.ts |
| 3509 | P4 | India GST e-invoicing IRN generation future | some-match | 09,14 | scripts/verify/step15-journals.ts |
| 3510 | P4 | India TDS/TCS | some-match | 09,14 | lib/compliance/jurisdictions.ts |
| 3511 | P4 | Singapore GST 9 | match | 09,14 | lib/tax/templates.ts |
| 3512 | P4 | Malaysia SST | match | 09,14 | lib/tax/templates.ts |
| 3513 | P4 | Thailand VAT 7 | match | 09,14 | lib/tax/templates.ts |
| 3514 | P4 | Philippines VAT 12 | match | 09,14 | lib/tax/templates.ts |
| 3515 | P4 | Indonesia VAT 11 | match | 09,14 | lib/tax/templates.ts |
| 3516 | P4 | Vietnam VAT 10 | match | 09,14 | lib/tax/templates.ts |
| 3517 | P4 | Japan Consumption Tax 10 | match | 09,14 | lib/tax/templates.ts |
| 3518 | P4 | South Korea VAT 10 | match | 09,14 | lib/tax/templates.ts |
| 3519 | P4 | Bangladesh VAT 15 | match | 09,14 | lib/tax/templates.ts |
| 3520 | P4 | Pakistan Sales Tax 17 | match | 09,14 | lib/tax/templates.ts |
| 3521 | P5 | preference for digital wallets | match | 09,14 | app/(dashboard)/integrations/messaging/page.tsx |
| 3522 | P5 | QR invoice- generic Global Payout Partners | match | 09,14 | config/payment-methods.ts |
| 3523 | P5 | Local Payment Methods via Licensed Partners | match | 09,14 | config/payment-methods.ts |
| 3524 | P5 | T+1 to T+3 | manual | 09,14 | - |
| 3525 | Q | PO invoice 3-way match | match | 07 | scripts/verify/step16-public-api.ts |
| 3526 | Q | one tenant multiple legal entities | match | 07 | lib/i18n/strings/en/s07-company.ts |
| 3527 | Q | (Bengali only) | manual | 07 | - |
| 3528 | Q | per department/project | generic-match | 07 | services/payroll/payroll-rules.ts |
| 3529 | Q | (Bengali only) | manual | 07 | - |
| 3530 | Q | multi-level dollar threshold | match | 07 | app/(dashboard)/payroll/settings/page.tsx |
| 3531 | Q | file-based NACHA/CSV | match | 07 | services/payroll/run-rules.ts |
| 3532 | Q | (Bengali only) | manual | 07 | - |
| 3533 | Q | SSO SAML 2.0 OIDC future-ready schema | match | 07 | lib/company/sections.ts |
| 3534 | Q | (Bengali only) | manual | 07 | - |
| 3535 | Q | SLA per enterprise contract | match | 07 | lib/i18n/strings/en/s07-company.ts |
| 3536 | Q | Dedicated support tier enterprise | generic-match | 07 | lib/utils/currency.ts |
| 3537 | Q | SOC2/ISO | some-match | 07 | lib/ocr/extract-rules.ts |
| 3538 | Q | retention | some-match | 07 | config/storage.ts |
| 3539 | Q | per-site billing | match | 07 | lib/cms/defaults/legal.ts |
| 3540 | Q | SOC 2 Type II ready | generic-match | 07 | sql/assertions/s16_005_social.sql |
| 3541 | Q | ISO 27001 ready | match | 07 | lib/payment/mor-engine.ts |
| 3542 | Q | HIPAA ready medical industry optional | match | 07 | lib/i18n/strings/en/s07-company.ts |
| 3543 | Q | litigation preservation | no-match | 07 | - |
| 3544 | Q | legal export | some-match | 07 | app/sitemap.ts |
| 3545 | R1 | (Bengali only) | manual | 09,10,14,15 | - |
| 3546 | R1 | (Bengali only) | manual | 09,10,14,15 | - |
| 3547 | R1 | 1000 lines per invoice virtual scroll | generic-match | 09,10,14,15 | lib/storage/validate/magic.ts |
| 3548 | R1 | notes 10KB | some-match | 09,10,14,15 | services/payroll/report-rules.ts |
| 3549 | R1 | PDF 10MB | some-match | 09,10,14,15 | services/payroll/run-rules.ts |
| 3550 | R1 | walk-in customer | some-match | 09,10,14,15 | services/invoice/send.ts |
| 3551 | R1 | create | manual | 09,10,14,15 | - |
| 3552 | R1 | block | some-match | 09,10,14,15 | app/(dashboard)/suppliers/[id]/statement/page.tsx |
| 3553 | R1 | immutable | some-match | 09,10,14,15 | migrations/S05_006_email.sql |
| 3554 | R1 | (Bengali only) | manual | 09,10,14,15 | - |
| 3555 | R2 | (Bengali only) | manual | 09,10,14,15 | - |
| 3556 | R2 | (Bengali only) | manual | 09,10,14,15 | - |
| 3557 | R2 | remaining due | match | 09,10,14,15 | services/accounting/period-rules.ts |
| 3558 | R2 | client pays in local settle in USD | match | 09,10,14,15 | services/mor/settle.ts |
| 3559 | R2 | (Bengali only) | manual | 09,10,14,15 | - |
| 3560 | R2 | (Bengali only) | manual | 09,10,14,15 | - |
| 3561 | R3 | owner ownership transfer | match | 09,10,14,15 | config/ownership.json |
| 3562 | R3 | staff account suspend draft invoices | match | 09,10,14,15 | lib/i18n/strings/en/s07-company.ts |
| 3563 | R3 | suspend client-facing links grace period | match | 09,10,14,15 | scripts/verify/step16-user-actions.ts |
| 3564 | R3 | still works | match | 09,10,14,15 | services/integration/automation.ts |
