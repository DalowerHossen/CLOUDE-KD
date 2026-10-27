<!-- path: docs/steps/STEP-16/AUDIT/PART-29.md -->
# Audit part 29 of 41: features 2773 to 2871

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 50, some-match 25, generic-match 4, no-match 5, manual 15. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 2773 | L3 | Supabase | some-match | 07 | services/payroll/runs.ts |
| 2774 | L3 | Resend/SMTP | match | 07 | migrations/S05_006_email.sql |
| 2775 | L3 | Google Drive API | match | 07 | migrations/S05_003_storage_adapters.sql |
| 2776 | L3 | graceful degradation | no-match | 07 | - |
| 2777 | M1 | built-in | some-match | 06 | app/(client-portal)/i/[token]/page.tsx |
| 2778 | M1 | unique per user | some-match | 06 | sql/assertions/s14_009_bnpl.sql |
| 2779 | M1 | (Bengali only) | manual | 06 | - |
| 2780 | M1 | admin user | manual | 06 | - |
| 2781 | M1 | Create your free invoice | some-match | 06 | lib/compliance/match.ts |
| 2782 | M1 | Powered by | some-match | 06 | lib/i18n/strings/en/s01-core.ts |
| 2783 | M1 | PLG | no-match | 06 | - |
| 2784 | M1 | Switch from X dedicated landing page | generic-match | 06 | services/payroll/reports.ts |
| 2785 | M1 | QuickBooks UX reduce learning curve | some-match | 06 | lib/migration/rules.ts |
| 2786 | M1 | vs competitor | no-match | 06 | - |
| 2787 | M1 | (Bengali only) | manual | 06 | - |
| 2788 | M1 | (Bengali only) | manual | 06 | - |
| 2789 | M1 | first 100 customers | manual | 06 | - |
| 2790 | M2 | auto email | manual | 06 | - |
| 2791 | M2 | special offer | generic-match | 06 | scripts/create-platform-user.mjs |
| 2792 | M2 | (Bengali only) | manual | 06 | - |
| 2793 | M2 | (Bengali only) | manual | 06 | - |
| 2794 | M2 | Your 100th invoice | manual | 06 | - |
| 2795 | M2 | contextual new feature release | some-match | 06 | lib/middleware/idempotency.ts |
| 2796 | M2 | What s new widget | some-match | 06 | scripts/verify/step08-core.ts |
| 2797 | M2 | which features unused | some-match | 06 | services/asset/depreciation-rules.ts |
| 2798 | M2 | health score drop auto-reach | match | 06 | scripts/verify/step16-tenant-insight.ts |
| 2799 | A1 | name email phone address DOB | match | 15 | services/payroll/payroll-rules.ts |
| 2800 | A1 | (Bengali only) | manual | 15 | - |
| 2801 | A1 | auto-generated unique | match | 15 | services/jobs/handler-types.ts |
| 2802 | A1 | department designation | match | 15 | services/payroll/payroll-rules.ts |
| 2803 | A1 | (Bengali only) | manual | 15 | - |
| 2804 | A1 | full-time/part-time/contract/intern | match | 15 | services/payroll/payroll-rules.ts |
| 2805 | A1 | hourly/monthly/commission | match | 15 | services/payroll/structures.ts |
| 2806 | A1 | encrypted for payout | match | 15 | sql/assertions/s16_027_payout_kinds.sql |
| 2807 | A1 | SSN/TIN/PAN encrypted | match | 15 | lib/logger/redact.ts |
| 2808 | A1 | (Bengali only) | manual | 15 | - |
| 2809 | A1 | contract ID Google Drive | match | 15 | migrations/S05_003_storage_adapters.sql |
| 2810 | A1 | active/on-leave/terminated | match | 15 | services/payroll/payroll-rules.ts |
| 2811 | A1 | avatar | some-match | 15 | migrations/S08_003_client_privacy.sql |
| 2812 | A1 | per tenant | manual | 15 | - |
| 2813 | A1 | CSV | some-match | 15 | services/payroll/run-rules.ts |
| 2814 | A1 | CSV | some-match | 15 | services/payroll/run-rules.ts |
| 2815 | A1 | department status name | some-match | 15 | services/payroll/payroll-rules.ts |
| 2816 | A1 | internal staff-only | some-match | 15 | services/payroll/runs.ts |
| 2817 | A2 | Grade A/B/C salary range | match | 15 | migrations/S15_010_payroll_people.sql |
| 2818 | A2 | basic HRA DA allowance bonus | match | 15 | scripts/verify/step15-payroll-calc.ts |
| 2819 | A2 | earning/deduction | match | 15 | services/payroll/structures.ts |
| 2820 | A2 | fixed/percentage/conditional | match | 15 | lib/credit/input.ts |
| 2821 | A2 | hours rate | match | 15 | services/payroll/runs.ts |
| 2822 | A2 | fixed variable | match | 15 | services/budget/insight-rules.ts |
| 2823 | A2 | sales commission | match | 15 | services/payroll/runs.ts |
| 2824 | A2 | 1.5x/2x configurable | no-match | 15 | - |
| 2825 | A2 | per week/month per jurisdiction | match | 15 | lib/i18n/strings/en/s15-accounting.ts |
| 2826 | A2 | performance/festival/annual | match | 15 | migrations/S15_013_hr.sql |
| 2827 | A2 | target-based | some-match | 15 | services/export/exports.ts |
| 2828 | A2 | mid-month join/leave pro-rata | match | 15 | services/payroll/calc-rules.ts |
| 2829 | A2 | configurable | no-match | 15 | - |
| 2830 | A2 | USD base display local | match | 15 | scripts/verify/step12-nmi.ts |
| 2831 | A2 | before finalize | some-match | 15 | services/invoice/send.ts |
| 2832 | A2 | every change tracked | match | 15 | migrations/S16_006_social_schedule.sql |
| 2833 | A3 | per jurisdiction | some-match | 15 | lib/compliance/retention.ts |
| 2834 | A3 | US Federal Income Tax W-4 based tax brackets | match | 15 | app/(dashboard)/payroll/settings/page.tsx |
| 2835 | A3 | US State Income Tax per state configurable | match | 15 | app/(dashboard)/payroll/settings/page.tsx |
| 2836 | A3 | US Social Security FICA 6.2 | match | 15 | sql/assertions/s15_010_payroll_people.sql |
| 2837 | A3 | US Medicare 1.45 additional | generic-match | 15 | services/payroll/tax-calc-rules.ts |
| 2838 | A3 | US FUTA/SUTA unemployment tax | some-match | 15 | services/payroll/run-rules.ts |
| 2839 | A3 | Asia GST/VAT on services if applicable | match | 15 | scripts/verify/step09-core.ts |
| 2840 | A3 | Asia TDS/TCS Tax Deducted at Source | match | 15 | scripts/verify/step09-core.ts |
| 2841 | A3 | admin per country | some-match | 15 | scripts/verify/step12-nmi.ts |
| 2842 | A3 | annual auto-notify | match | 15 | services/hr/leave.ts |
| 2843 | A3 | deductions exemptions | match | 15 | migrations/S15_010_payroll_people.sql |
| 2844 | A3 | employee self-service | match | 15 | sql/assertions/s15_013_hr.sql |
| 2845 | A3 | per employee | some-match | 15 | services/payroll/run-rules.ts |
| 2846 | A3 | per employee per period | match | 15 | services/payroll/run-rules.ts |
| 2847 | A3 | 1099/W-2 format CSV | match | 15 | lib/compliance/audit-export.ts |
| 2848 | A4 | select period select employees | match | 15 | services/payroll/run-rules.ts |
| 2849 | A4 | weekly/bi-weekly/semi-monthly/monthly | match | 15 | migrations/S09_015_reports.sql |
| 2850 | A4 | preview before finalize | generic-match | 15 | scripts/verify/step11-verifone.ts |
| 2851 | A4 | HR owner approve | some-match | 15 | services/payroll/run-rules.ts |
| 2852 | A4 | lock immutable | match | 15 | sql/assertions/s04_004_tokens.sql |
| 2853 | A4 | with audit trail admin only | some-match | 15 | app/api/public-site/legal/accept/route.ts |
| 2854 | A4 | cron recurring | match | 15 | cron/jobs/s15-expenses.ts |
| 2855 | A4 | employees notified on payday | match | 15 | services/payroll/runs.ts |
| 2856 | A4 | all past runs | match | 15 | lib/migration/rules.ts |
| 2857 | A4 | total payroll deductions net | match | 15 | services/payroll/run-rules.ts |
| 2858 | A4 | large companies background | match | 15 | scripts/verify/step13-esign.ts |
| 2859 | A4 | missing data invalid bank | match | 15 | lib/i18n/strings/en/s07-company.ts |
| 2860 | A5 | per employee per pay period | match | 15 | services/payroll/run-rules.ts |
| 2861 | A5 | PDF branded professional layout | some-match | 15 | services/estimate/pdf.ts |
| 2862 | A5 | encrypted to employee email | match | 15 | services/payroll/runs.ts |
| 2863 | A5 | employee self-service token link | match | 15 | migrations/S15_012_employee_portal.sql |
| 2864 | A5 | admin before send | manual | 15 | - |
| 2865 | A5 | per tenant | manual | 15 | - |
| 2866 | A5 | YTD | some-match | 15 | services/payroll/run-rules.ts |
| 2867 | A5 | all employees one-click | match | 15 | components/payroll/leave-form.tsx |
| 2868 | A5 | Google Drive encrypted | match | 15 | services/storage/resolver.ts |
| 2869 | A5 | tamper-proof | match | 15 | lib/pdf/evidence-pack-pdf.tsx |
| 2870 | A6 | on finalize | some-match | 15 | services/invoice/send.ts |
| 2871 | A6 | salary expense tax payable net payable | match | 15 | config/s15-accounting.ts |
