<!-- path: docs/steps/STEP-16/AUDIT/PART-08.md -->
# Audit part 8 of 41: features 694 to 792

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 35, some-match 40, generic-match 3, no-match 2, manual 19. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 694 | H3 | Subscription renewal owner reminder | match | 05 | cron/jobs/s14-subscriptions.ts |
| 695 | H3 | System maintenance all users | some-match | 05 | lib/api/with-api.ts |
| 696 | H3 | Security alert affected user | match | 05 | services/incident/incident-service.ts |
| 697 | I1 | CRUD Free/Starter/Pro/Enterprise | match | 14 | lib/i18n/strings/en/s07-company.ts |
| 698 | I1 | free/starter/pro/enterprise | match | 14 | lib/i18n/strings/en/s07-company.ts |
| 699 | I1 | monthly/annual | match | 14 | services/payroll/payroll-rules.ts |
| 700 | I1 | entitlement mapping | generic-match | 14 | config/storage.ts |
| 701 | I1 | invoices/clients/staff/storage | some-match | 14 | scripts/verify/step16-automation.ts |
| 702 | I1 | configurable | no-match | 14 | - |
| 703 | I1 | coercion fix no data loss | match | 14 | lib/i18n/strings/en/s15-accounting.ts |
| 704 | I1 | hide from new signups | match | 14 | lib/i18n/strings/en/s03-auth.ts |
| 705 | I1 | move tenants between plans | some-match | 14 | cron/jobs/s05-storage-migrate.ts |
| 706 | I2 | sync | some-match | 14 | scripts/verify/step16-automation.ts |
| 707 | I2 | prorated | some-match | 14 | scripts/verify/step14-client-subscriptions.ts |
| 708 | I2 | end of cycle | some-match | 14 | app/(dashboard)/subscriptions/page.tsx |
| 709 | I2 | end of cycle | some-match | 14 | app/(dashboard)/subscriptions/page.tsx |
| 710 | I2 | (Bengali only) | manual | 14 | - |
| 711 | I2 | (Bengali only) | manual | 14 | - |
| 712 | I2 | Never-lock data never deleted | match | 14 | services/wallet/ledger.ts |
| 713 | I2 | Free | some-match | 14 | lib/compliance/match.ts |
| 714 | I2 | dunning 3 attempts | match | 14 | config/s14-subscriptions.ts |
| 715 | I2 | 7d 3d 1d | manual | 14 | - |
| 716 | I2 | (Bengali only) | manual | 14 | - |
| 717 | I3 | percentage/fixed amount | match | 14 | lib/utils/currency.ts |
| 718 | I3 | custom/auto-generated | some-match | 14 | scripts/integration-check.sh |
| 719 | I3 | (Bengali only) | manual | 14 | - |
| 720 | I3 | total/per user | some-match | 14 | services/payroll/run-rules.ts |
| 721 | I3 | specific plans only | some-match | 14 | scripts/verify/step16-modules.ts |
| 722 | I3 | checkout | some-match | 14 | scripts/verify/step12-nmi.ts |
| 723 | I3 | (Bengali only) | manual | 14 | - |
| 724 | I3 | (Bengali only) | manual | 14 | - |
| 725 | I4 | entitlement | some-match | 14 | config/storage.ts |
| 726 | I4 | (Bengali only) | manual | 14 | - |
| 727 | I4 | UI soft paywall | match | 14 | services/entitlement/usage.ts |
| 728 | I4 | entitlement | some-match | 14 | config/storage.ts |
| 729 | I4 | usage-based | some-match | 14 | config/s16-api.ts |
| 730 | I4 | visual | no-match | 14 | - |
| 731 | I4 | in-app | some-match | 14 | app/robots.ts |
| 732 | I4 | server-side | some-match | 14 | lib/payment/adapters/fastspring/webhook.ts |
| 733 | J1 | AES-256 encrypted | match | 14 | services/encryption/encryption-service.ts |
| 734 | J1 | Stripe API publishable secret | match | 14 | scripts/verify/step11-stripe.ts |
| 735 | J1 | PayPal ID/ | match | 14 | lib/payment/adapters/paypal.ts |
| 736 | J1 | Paddle Vendor ID/Auth Code | match | 14 | types/contracts/payment-adapter.ts |
| 737 | J1 | NMI Security Key/Source Key | match | 14 | config/ownership.json |
| 738 | J1 | Rapyd API | some-match | 14 | lib/payment/adapters/index.generated.ts |
| 739 | J1 | Adyen API | some-match | 14 | scripts/verify/step12-adyen.ts |
| 740 | J1 | any provider | some-match | 14 | lib/middleware/bot-detector.ts |
| 741 | J1 | (Bengali only) | manual | 14 | - |
| 742 | J1 | enable/disable per gateway | match | 14 | lib/i18n/strings/en/s04-security.ts |
| 743 | J1 | (Bengali only) | manual | 14 | - |
| 744 | J1 | drag-drop | match | 14 | components/onboarding/logo-upload.tsx |
| 745 | J1 | per gateway | some-match | 14 | app/api/integrations/settlement/payouts/route.ts |
| 746 | J1 | per gateway | some-match | 14 | app/api/integrations/settlement/payouts/route.ts |
| 747 | J2 | Global Payout Partners enable/disable | match | 14 | migrations/S14_003_payouts.sql |
| 748 | J2 | Local Payment Methods via Licensed Partners | match | 14 | config/payment-methods.ts |
| 749 | J2 | per country | some-match | 14 | scripts/verify/step12-nmi.ts |
| 750 | J2 | checkout display | some-match | 14 | scripts/verify/step12-nmi.ts |
| 751 | J2 | per method | some-match | 14 | services/payroll/runs.ts |
| 752 | K1 | 2FA toggle | some-match | 03,07 | components/layout/topbar.tsx |
| 753 | K1 | owner | manual | 03,07 | - |
| 754 | K1 | IP CIDR allowlist | generic-match | 03,07 | migrations/S04_002_network_intel.sql |
| 755 | K1 | per tenant | manual | 03,07 | - |
| 756 | K1 | amount cap | match | 03,07 | services/payroll/structures.ts |
| 757 | K1 | owner | manual | 03,07 | - |
| 758 | K1 | (Bengali only) | manual | 03,07 | - |
| 759 | K1 | (Bengali only) | manual | 03,07 | - |
| 760 | K1 | min length complexity | match | 03,07 | lib/company/sections.ts |
| 761 | L1 | JSON all tenant data | some-match | 05,07 | services/estimate/public.ts |
| 762 | L1 | encrypted ZIP | match | 05,07 | migrations/S13_009_evidence_packs.sql |
| 763 | L1 | daily/weekly auto | match | 05,07 | sql/assertions/s14_003_payouts.sql |
| 764 | L1 | last 10 backups | some-match | 05,07 | app/api/auth/2fa/enroll/confirm/route.ts |
| 765 | L1 | with confirmation | some-match | 05,07 | app/api/auth/2fa/enroll/begin/route.ts |
| 766 | L1 | checksum | some-match | 05,07 | sql/assertions/s13_009_evidence_packs.sql |
| 767 | A1 | multi-step form | manual | 09 | - |
| 768 | A1 | draft/sent status check | some-match | 09 | scripts/verify/step16-automation.ts |
| 769 | A1 | soft delete trash | match | 09 | sql/assertions/s09_002_invoices_core.sql |
| 770 | A1 | one-click clone | match | 09 | components/invoice/invoice-actions.tsx |
| 771 | A1 | table view card view | manual | 09 | - |
| 772 | A1 | number client amount date | some-match | 09 | services/payroll/run-rules.ts |
| 773 | A1 | status date range client amount | match | 09 | app/(dashboard)/suppliers/[id]/statement/page.tsx |
| 774 | A1 | date amount status client | some-match | 09 | services/payroll/run-rules.ts |
| 775 | A1 | cursor-based 25/50/100 | some-match | 09 | services/product/search.ts |
| 776 | A1 | CSV/PDF/JSON | match | 09 | components/accounting/attachment-form.tsx |
| 777 | A1 | checkbox | some-match | 09 | app/(dashboard)/subscriptions/[id]/page.tsx |
| 778 | A1 | send/delete/export/archive | some-match | 09 | app/api/subscriptions/client/plans/[id]/archive/route.ts |
| 779 | A2 | add/remove rows | some-match | 09 | services/payout/schedule.ts |
| 780 | A2 | Description Qty Unit Price Amount | match | 09 | services/client/tenant-export.ts |
| 781 | A2 | Tax rate per line | match | 09 | services/payroll/runs.ts |
| 782 | A2 | Discount per line or fixed | match | 09 | services/invoice/invoices.ts |
| 783 | A2 | Unit of Measure hours/units/kg/miles | match | 09 | lib/catalog/products.ts |
| 784 | A2 | Item code/SKU | some-match | 09 | services/import/targets/products.ts |
| 785 | A2 | HS/SAC optional | match | 09 | lib/i18n/strings/en/s08-crm.ts |
| 786 | A2 | Qty Price Amount | match | 09 | scripts/verify/step09-calc.ts |
| 787 | A2 | (Bengali only) | manual | 09 | - |
| 788 | A2 | (Bengali only) | manual | 09 | - |
| 789 | A2 | quick add | some-match | 09 | scripts/integration-check.sh |
| 790 | A2 | 1000 lines virtual scroll | generic-match | 09 | lib/storage/validate/magic.ts |
| 791 | A2 | credit/adjustment | match | 09 | services/credit/pdf.ts |
| 792 | A2 | informational | some-match | 09 | services/cms/legal.ts |
