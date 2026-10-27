<!-- path: docs/steps/STEP-16/AUDIT/PART-06.md -->
# Audit part 6 of 41: features 496 to 594

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 36, some-match 24, generic-match 5, no-match 4, manual 30. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 496 | C1 | (Bengali only) | manual | 07 | - |
| 497 | C1 | USD default | some-match | 07 | services/payroll/run-rules.ts |
| 498 | C1 | Terms Privacy mandatory | match | 07 | lib/cms/legal-pages.ts |
| 499 | C1 | Terms IP | some-match | 07 | scripts/verify/step16-settlement.ts |
| 500 | C1 | progress indicator | generic-match | 07 | lib/middleware/idempotency.ts |
| 501 | C2 | post-signup 5 steps | some-match | 07 | app/(admin)/admin/analytics/page.tsx |
| 502 | C2 | Step 1 name address phone | match | 07 | services/payroll/payroll-rules.ts |
| 503 | C2 | Step 2 drag-drop crop | match | 07 | components/onboarding/logo-upload.tsx |
| 504 | C2 | Step 3 colors font | match | 07 | components/marketing/charts/bar-chart.tsx |
| 505 | C2 | Step 4 prefix numbering terms | match | 07 | services/invoice/send.ts |
| 506 | C2 | Step 5 optional skip allowed | match | 07 | services/migration/jobs.ts |
| 507 | C2 | CompanyProvider from signup data | match | 07 | lib/cms/defaults/features.ts |
| 508 | C2 | frozen at invoice time | some-match | 07 | services/invoice/prepare.ts |
| 509 | C2 | INV- EST- CN- | match | 07 | services/credit/adjustments.ts |
| 510 | C2 | sequential custom | some-match | 07 | components/onboarding/wizard.tsx |
| 511 | C2 | Net 15/30/60 | some-match | 07 | services/payroll/run-rules.ts |
| 512 | C2 | (Bengali only) | manual | 07 | - |
| 513 | C2 | USD base display currencies | match | 07 | scripts/verify/step12-nmi.ts |
| 514 | C2 | retroactive | no-match | 07 | - |
| 515 | C2 | setup later | match | 07 | lib/i18n/strings/en/s03-auth.ts |
| 516 | C2 | resume anytime | some-match | 07 | app/api/subscriptions/client/[id]/resume/route.ts |
| 517 | C2 | confetti | some-match | 07 | components/shared/confetti.tsx |
| 518 | C3 | service/retail/medical/freelance/agency/ecommerce | match | 07 | lib/company/sections.ts |
| 519 | C3 | hourly billing projects | match | 07 | services/project/billing.ts |
| 520 | C3 | product catalog inventory | match | 07 | sql/assertions/s08_004_products.sql |
| 521 | C3 | patient billing HIPAA-ready | match | 07 | lib/company/presets.ts |
| 522 | C3 | minimal setup quick invoice | match | 07 | lib/company/presets.ts |
| 523 | C3 | team clients projects retainers | match | 07 | lib/cms/defaults/industries.ts |
| 524 | C3 | Shopify/WooCommerce sync | match | 07 | lib/integrations/mapping-rules.ts |
| 525 | C3 | COA | no-match | 07 | - |
| 526 | C3 | (Bengali only) | manual | 07 | - |
| 527 | C3 | (Bengali only) | manual | 07 | - |
| 528 | C3 | (Bengali only) | manual | 07 | - |
| 529 | C3 | (Bengali only) | manual | 07 | - |
| 530 | C4 | first-login | some-match | 07 | scripts/verify/step16-tenant-insight.ts |
| 531 | C4 | feature discovery | no-match | 07 | - |
| 532 | C4 | Create your first invoice | manual | 07 | - |
| 533 | C4 | one-click clearable | some-match | 07 | lib/middleware/bot-detector.ts |
| 534 | C4 | one-click | some-match | 07 | lib/middleware/bot-detector.ts |
| 535 | C4 | sidebar widget | generic-match | 07 | components/layout/sidebar.tsx |
| 536 | C4 | percentage | some-match | 07 | lib/ocr/extract-rules.ts |
| 537 | C4 | day 1 3 7 14 | some-match | 07 | services/payroll/run-rules.ts |
| 538 | C4 | first invoice first payment | generic-match | 07 | services/payroll/runs.ts |
| 539 | C4 | Need help first 7 days | match | 07 | services/accounting/posting-rules.ts |
| 540 | C4 | contextual per page | no-match | 07 | - |
| 541 | D1 | (Bengali only) | manual | 07 | - |
| 542 | D1 | (Bengali only) | manual | 07 | - |
| 543 | D1 | sole proprietor/LLC/corp/partnership | match | 07 | lib/i18n/strings/en/s07-company.ts |
| 544 | D1 | street city state zip country | match | 07 | lib/migration/rules.ts |
| 545 | D1 | (Bengali only) | manual | 07 | - |
| 546 | D1 | (Bengali only) | manual | 07 | - |
| 547 | D1 | (Bengali only) | manual | 07 | - |
| 548 | D1 | Tax ID EIN GST VAT | match | 07 | lib/i18n/strings/en/s09-invoicing.ts |
| 549 | D1 | (Bengali only) | manual | 07 | - |
| 550 | D1 | upload crop preview | match | 07 | services/import/imports.ts |
| 551 | D1 | (Bengali only) | manual | 07 | - |
| 552 | D1 | frozen per invoice | some-match | 07 | services/invoice/prepare.ts |
| 553 | D1 | (Bengali only) | manual | 07 | - |
| 554 | D1 | separate from owner | some-match | 07 | scripts/verify/step11-verifone.ts |
| 555 | D1 | (Bengali only) | manual | 07 | - |
| 556 | D1 | MM/DD/YYYY DD/MM/YYYY | some-match | 07 | lib/ocr/extract-rules.ts |
| 557 | D1 | Jan-Dec Apr-Mar Jul-Jun | match | 07 | lib/ocr/extract-rules.ts |
| 558 | D2 | hex picker | generic-match | 07 | lib/middleware/idempotency.ts |
| 559 | D2 | (Bengali only) | manual | 07 | - |
| 560 | D2 | (Bengali only) | manual | 07 | - |
| 561 | D2 | Inter/Roboto/Poppins/system | match | 07 | lib/branding/theme.ts |
| 562 | D2 | multiple layouts | generic-match | 07 | scripts/verify/step11-stripe.ts |
| 563 | D2 | top-left/top-center | match | 07 | styles/globals.css |
| 564 | D2 | sm/md/lg | manual | 07 | - |
| 565 | D2 | PDF | some-match | 07 | services/payroll/run-rules.ts |
| 566 | D2 | (Bengali only) | manual | 07 | - |
| 567 | D2 | (Bengali only) | manual | 07 | - |
| 568 | D2 | (Bengali only) | manual | 07 | - |
| 569 | D2 | (Bengali only) | manual | 07 | - |
| 570 | D2 | real-time | manual | 07 | - |
| 571 | D2 | a11y | some-match | 07 | lib/pdf/invoice-pdf.tsx |
| 572 | D2 | default | manual | 07 | - |
| 573 | D2 | JSON | some-match | 07 | services/estimate/public.ts |
| 574 | D3 | INV- EST- CN- DN- PO- | match | 07 | services/credit/adjustments.ts |
| 575 | D3 | YYYY-NNNN custom | match | 07 | sql/assertions/s15_011_pay_runs.sql |
| 576 | D3 | yearly | some-match | 07 | services/invoice/send.ts |
| 577 | D3 | Due on receipt/Net 15/30/60 | match | 07 | services/credit/pdf.ts |
| 578 | D3 | (Bengali only) | manual | 07 | - |
| 579 | D3 | Terms Conditions | match | 07 | scripts/verify/step16-settlement.ts |
| 580 | D3 | percentage/fixed | match | 07 | lib/utils/currency.ts |
| 581 | D3 | (Bengali only) | manual | 07 | - |
| 582 | D3 | 2/4/6 digits | some-match | 07 | lib/tax/input.ts |
| 583 | D3 | nearest/half-up/half-down/banker s | match | 07 | scripts/verify/step09-calc.ts |
| 584 | D3 | Tax-inclusive vs exclusive default | match | 07 | scripts/verify/step09-calc.ts |
| 585 | D3 | taxable | some-match | 07 | app/(dashboard)/payroll/settings/page.tsx |
| 586 | D3 | Unit of Measure hours/units/kg | match | 07 | services/integration/commerce-orders.ts |
| 587 | D3 | US/International | some-match | 07 | migrations/S16_027_payout_kinds.sql |
| 588 | D3 | Amount in Words | match | 07 | services/accounting/posting-rules.ts |
| 589 | D3 | Remit-To bank details | match | 07 | scripts/verify/step09-core.ts |
| 590 | E1 | email-based pending active | match | 07 | services/payroll/portal.ts |
| 591 | E1 | (Bengali only) | manual | 07 | - |
| 592 | E1 | (Bengali only) | manual | 07 | - |
| 593 | E1 | (Bengali only) | manual | 07 | - |
| 594 | E1 | name email role avatar | some-match | 07 | migrations/S08_003_client_privacy.sql |
