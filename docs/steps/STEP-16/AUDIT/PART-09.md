<!-- path: docs/steps/STEP-16/AUDIT/PART-09.md -->
# Audit part 9 of 41: features 793 to 891

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 42, some-match 28, generic-match 3, no-match 3, manual 23. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 793 | A3 | numeric 18 4 no float | match | 09 | scripts/check-migrations.mjs |
| 794 | A3 | (Bengali only) | manual | 09 | - |
| 795 | A3 | percentage/fixed per line or total | match | 09 | lib/utils/currency.ts |
| 796 | A3 | per line or total | some-match | 09 | services/payroll/run-rules.ts |
| 797 | A3 | (Bengali only) | manual | 09 | - |
| 798 | A3 | taxable/non-taxable toggle | match | 09 | services/payroll/calc-rules.ts |
| 799 | A3 | (Bengali only) | manual | 09 | - |
| 800 | A3 | (Bengali only) | manual | 09 | - |
| 801 | A3 | Amount in Words auto-generate | match | 09 | lib/payment/coupon-rules.ts |
| 802 | A3 | (Bengali only) | manual | 09 | - |
| 803 | A3 | (Bengali only) | manual | 09 | - |
| 804 | A3 | 2/4/6 digits | some-match | 09 | lib/tax/input.ts |
| 805 | A3 | no trailing zero issues | match | 09 | services/payroll/runs.ts |
| 806 | A3 | Tax-inclusive vs exclusive | match | 09 | scripts/verify/step09-calc.ts |
| 807 | A3 | (Bengali only) | manual | 09 | - |
| 808 | A3 | Withholding tax | match | 09 | services/invoice/prepare.ts |
| 809 | A4 | sequential | some-match | 02,09 | components/onboarding/wizard.tsx |
| 810 | A4 | Gapless | no-match | 02,09 | - |
| 811 | A4 | PostgreSQL advisory lock | match | 02,09 | types/contracts/locks.ts |
| 812 | A4 | INV-YYYY-NNNN | match | 02,09 | services/accounting/posting-rules.ts |
| 813 | A4 | auto Jan 1 | some-match | 02,09 | lib/ocr/extract-rules.ts |
| 814 | A4 | INV/EST/CN/DN/PO | match | 02,09 | services/credit/adjustments.ts |
| 815 | A4 | draft only | some-match | 02,09 | scripts/verify/step16-automation.ts |
| 816 | A4 | (Bengali only) | manual | 02,09 | - |
| 817 | A5 | draft | some-match | 09 | scripts/verify/step16-automation.ts |
| 818 | A5 | sent | manual | 09 | - |
| 819 | A5 | viewed client opened link | match | 09 | services/estimate/public.ts |
| 820 | A5 | paid | some-match | 09 | services/payroll/run-rules.ts |
| 821 | A5 | partial partial payment received | generic-match | 09 | services/payroll/runs.ts |
| 822 | A5 | overdue | some-match | 09 | cron/jobs/s09-overdue.ts |
| 823 | A5 | cancelled | some-match | 09 | app/(dashboard)/suppliers/[id]/statement/page.tsx |
| 824 | A5 | draft sent viewed paid | match | 09 | sql/assertions/s09_002_invoices_core.sql |
| 825 | A5 | payment received paid | some-match | 09 | services/payroll/run-rules.ts |
| 826 | A5 | due date passed overdue cron | match | 09 | scripts/verify/step13-disputes.ts |
| 827 | A5 | owner only | manual | 09 | - |
| 828 | A5 | immutable after send | some-match | 09 | migrations/S05_006_email.sql |
| 829 | A5 | version tracking | some-match | 09 | services/project/time.ts |
| 830 | A5 | every 30 seconds | some-match | 09 | app/api/plans/migrate/route.ts |
| 831 | A5 | same client same amount same date | some-match | 09 | services/payroll/run-rules.ts |
| 832 | A5 | staff draft owner approve | match | 09 | services/payroll/runs.ts |
| 833 | A5 | UI 30-day retention | match | 09 | services/storage/retention.ts |
| 834 | A6 | issue date | some-match | 09 | services/payroll/runs.ts |
| 835 | A6 | due date auto from terms | match | 09 | services/bnpl/installments.ts |
| 836 | A6 | Due on receipt/Net 15/30/60/90 | match | 09 | services/credit/pdf.ts |
| 837 | A6 | PO client s purchase order | match | 09 | app/(dashboard)/suppliers/[id]/page.tsx |
| 838 | A6 | client-visible | some-match | 09 | migrations/S02_003_locks.sql |
| 839 | A6 | staff-only not on PDF | some-match | 09 | services/payroll/run-rules.ts |
| 840 | A6 | custom labels | some-match | 09 | services/payroll/report-rules.ts |
| 841 | A6 | (Bengali only) | manual | 09 | - |
| 842 | A6 | (Bengali only) | manual | 09 | - |
| 843 | A6 | Google Drive encrypted | match | 09 | services/storage/resolver.ts |
| 844 | A6 | all events chronologically | some-match | 09 | services/payroll/run-rules.ts |
| 845 | A6 | who changed what when | match | 09 | services/payroll/runs.ts |
| 846 | B1 | US Amazon vendor compliant | generic-match | 09 | services/email/settings.ts |
| 847 | B1 | Amazon-acceptable zero hesitation acceptance | some-match | 09 | services/cms/legal.ts |
| 848 | B1 | Bill To client name address contact | match | 09 | services/payment/card-search.ts |
| 849 | B1 | Ship To separate shipping address | match | 09 | services/invoice/invoices.ts |
| 850 | B1 | Invoice No Date Terms top-right | match | 09 | lib/i18n/strings/en/s06-public.ts |
| 851 | B1 | Qty Unit Price Amount standard columns | match | 09 | lib/i18n/strings/en/s08-crm.ts |
| 852 | B1 | Subtotal Tax Shipping Discount Total | match | 09 | services/invoice/invoices.ts |
| 853 | B1 | Amount in Words e.g. Five Hundred USD Only | match | 09 | scripts/verify/step09-calc.ts |
| 854 | B1 | Remit To bank name account routing SWIFT | match | 09 | components/client/views/invoice-view.tsx |
| 855 | B1 | Tax ID EIN seller | match | 09 | lib/i18n/strings/en/s09-invoicing.ts |
| 856 | B1 | Client Tax ID VAT GST | match | 09 | scripts/verify/step09-calc.ts |
| 857 | B1 | PO prominent display | no-match | 09 | - |
| 858 | B1 | Terms Conditions bottom | match | 09 | scripts/verify/step16-settlement.ts |
| 859 | B1 | Net terms e.g. Net 30 | match | 09 | scripts/verify/step16-settlement.ts |
| 860 | B1 | Seller tax registration | match | 09 | lib/pdf/invoice-pdf.tsx |
| 861 | B1 | USD base | match | 09 | scripts/verify/step12-nmi.ts |
| 862 | B1 | rate-wise breakdown | match | 09 | scripts/verify/step09-calc.ts |
| 863 | B2 | US Classic/Modern/Minimal/Detailed | match | 09 | services/invoice/invoices.ts |
| 864 | B2 | A4 | manual | 09 | - |
| 865 | B2 | Letter US standard | match | 09 | services/payroll/payroll-rules.ts |
| 866 | B2 | A4 Letter per invoice/per tenant | some-match | 09 | lib/compliance/match.ts |
| 867 | B2 | real-time | manual | 09 | - |
| 868 | B2 | colors fonts sections | match | 09 | components/client/branding-form.tsx |
| 869 | B2 | per tenant | manual | 09 | - |
| 870 | B2 | (Bengali only) | manual | 09 | - |
| 871 | B3 | owner settings invoice | manual | 09 | - |
| 872 | B3 | invoice header | some-match | 09 | app/layout.tsx |
| 873 | B3 | (Bengali only) | manual | 09 | - |
| 874 | B3 | PDF email | some-match | 09 | services/payroll/run-rules.ts |
| 875 | B3 | PDF | some-match | 09 | services/payroll/run-rules.ts |
| 876 | B3 | (Bengali only) | manual | 09 | - |
| 877 | B3 | frozen at send time | some-match | 09 | services/invoice/prepare.ts |
| 878 | C1 | PDF React-PDF | match | 09 | services/payroll/runs.ts |
| 879 | C1 | (Bengali only) | manual | 09 | - |
| 880 | C1 | (Bengali only) | manual | 09 | - |
| 881 | C1 | avoid orphan rows | generic-match | 09 | lib/payment/adapters/payarc/api.ts |
| 882 | C1 | X of Y | manual | 09 | - |
| 883 | C1 | page CSS | some-match | 09 | scripts/check-path-comment.sh |
| 884 | C1 | PDF one-click | match | 09 | app/(admin)/admin/kyc/_components/review-panel.tsx |
| 885 | C1 | PDF in-app browser | match | 09 | lib/tax/input.ts |
| 886 | C1 | PDF native viewer | match | 09 | components/reports/report-viewer.tsx |
| 887 | C2 | only used glyphs | some-match | 09 | lib/pdf/shared/fonts.ts |
| 888 | C2 | DPI | no-match | 09 | - |
| 889 | C2 | (Bengali only) | manual | 09 | - |
| 890 | C2 | PDF | some-match | 09 | services/payroll/run-rules.ts |
| 891 | C2 | PDF tamper-proof | match | 09 | lib/pdf/evidence-pack-pdf.tsx |
