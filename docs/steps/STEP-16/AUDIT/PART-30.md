<!-- path: docs/steps/STEP-16/AUDIT/PART-30.md -->
# Audit part 30 of 41: features 2872 to 2970

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 33, some-match 30, generic-match 4, no-match 4, manual 28. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 2872 | A6 | COA configurable | no-match | 15 | - |
| 2873 | A6 | accountant review | match | 15 | services/accounting/posting.ts |
| 2874 | A6 | if pay run reversed | match | 15 | services/payout/payouts.ts |
| 2875 | A6 | by department by period | match | 15 | services/payroll/payroll-rules.ts |
| 2876 | A6 | (Bengali only) | manual | 15 | - |
| 2877 | A7 | token link no login required | match | 15 | services/bankfeed/sync.ts |
| 2878 | A7 | (Bengali only) | manual | 15 | - |
| 2879 | A7 | (Bengali only) | manual | 15 | - |
| 2880 | A7 | (Bengali only) | manual | 15 | - |
| 2881 | A7 | (Bengali only) | manual | 15 | - |
| 2882 | A7 | (Bengali only) | manual | 15 | - |
| 2883 | A7 | YTD | some-match | 15 | services/payroll/run-rules.ts |
| 2884 | A7 | (Bengali only) | manual | 15 | - |
| 2885 | A8 | annual/sick/maternity/paternity/unpaid/public | generic-match | 15 | app/(dashboard)/payroll/settings/page.tsx |
| 2886 | A8 | per employee per type | some-match | 15 | services/payroll/run-rules.ts |
| 2887 | A8 | per month/per year pro-rata | match | 15 | services/payroll/calc-rules.ts |
| 2888 | A8 | employee manager approve | match | 15 | lib/i18n/strings/en/s15-hr.ts |
| 2889 | A8 | (Bengali only) | manual | 15 | - |
| 2890 | A8 | team view | some-match | 15 | services/bnpl/settings.ts |
| 2891 | A8 | per employee | some-match | 15 | services/payroll/run-rules.ts |
| 2892 | A8 | year-end | some-match | 15 | services/payroll/run-rules.ts |
| 2893 | A8 | unused leave payout | match | 15 | scripts/verify/step10-flow.ts |
| 2894 | A8 | per country auto-populate | generic-match | 15 | scripts/verify/step12-nmi.ts |
| 2895 | A8 | per tenant | manual | 15 | - |
| 2896 | A9 | NACHA/ACH format US | match | 15 | migrations/S16_027_payout_kinds.sql |
| 2897 | A9 | bank-specific Asia | match | 15 | scripts/verify/step09-core.ts |
| 2898 | A9 | Global Payout Partners batch | match | 15 | scripts/verify/step16-settlement.ts |
| 2899 | A9 | per employee | some-match | 15 | services/payroll/run-rules.ts |
| 2900 | A9 | retry manual | some-match | 15 | app/api/integrations/settlement/statement/route.ts |
| 2901 | A9 | bank vs payroll | match | 15 | services/payroll/run-rules.ts |
| 2902 | A9 | per period | some-match | 15 | services/payroll/run-rules.ts |
| 2903 | A10 | monthly/quarterly/yearly | match | 15 | migrations/S15_008_budgets_entities.sql |
| 2904 | A10 | per employee | some-match | 15 | services/payroll/run-rules.ts |
| 2905 | A10 | per jurisdiction | some-match | 15 | lib/compliance/retention.ts |
| 2906 | A10 | cost by department | match | 15 | lib/i18n/strings/en/s15-payroll.ts |
| 2907 | A10 | MoM YoY | manual | 15 | - |
| 2908 | A10 | (Bengali only) | manual | 15 | - |
| 2909 | A10 | 1099 US independent contractors | generic-match | 15 | lib/encryption/aead.ts |
| 2910 | A10 | W-2 US employees | some-match | 15 | services/payroll/run-rules.ts |
| 2911 | A10 | all changes | some-match | 15 | services/payroll/runs.ts |
| 2912 | A10 | per jurisdiction | some-match | 15 | lib/compliance/retention.ts |
| 2913 | A10 | for external accountant | match | 15 | app/api/payroll/reports/[report]/export/route.ts |
| 2914 | B1 | (Bengali only) | manual | 15 | - |
| 2915 | B1 | (Bengali only) | manual | 15 | - |
| 2916 | B1 | (Bengali only) | manual | 15 | - |
| 2917 | B1 | tree view | some-match | 15 | services/expense/categories.ts |
| 2918 | B1 | manager reportee | some-match | 15 | services/project/time.ts |
| 2919 | B1 | (Bengali only) | manual | 15 | - |
| 2920 | B2 | HR tasks | some-match | 15 | services/hr/hr-rules.ts |
| 2921 | B2 | exit tasks | match | 15 | scripts/verify/step09-tenant.mjs |
| 2922 | B2 | resignation payout | generic-match | 15 | services/hr/lifecycle.ts |
| 2923 | B2 | with compliance | some-match | 15 | scripts/create-platform-user.mjs |
| 2924 | B2 | template | some-match | 15 | services/payroll/runs.ts |
| 2925 | B2 | auto-generate | some-match | 15 | services/payroll/runs.ts |
| 2926 | B3 | quarterly/annual | match | 15 | services/payroll/report-rules.ts |
| 2927 | B3 | 1-5 scale | some-match | 15 | components/marketing/charts/bar-chart.tsx |
| 2928 | B3 | manager employee | match | 15 | migrations/S15_013_hr_down.sql |
| 2929 | B3 | optional | some-match | 15 | services/payroll/run-rules.ts |
| 2930 | B3 | per employee per period | match | 15 | services/payroll/run-rules.ts |
| 2931 | C1 | date category amount description | match | 15 | scripts/verify/step16-public-api.ts |
| 2932 | C1 | (Bengali only) | manual | 15 | - |
| 2933 | C1 | travel meals office software etc. | match | 15 | services/expense/categories.ts |
| 2934 | C1 | nested | some-match | 15 | scripts/verify/step12-nmi.ts |
| 2935 | C1 | photo/PDF Google Drive | match | 15 | lib/i18n/strings/en/s16-ocr.ts |
| 2936 | C1 | OCR auto-extract fields | match | 15 | lib/ocr/extract-rules.ts |
| 2937 | C1 | staff manager owner | some-match | 15 | services/project/time.ts |
| 2938 | C1 | per approver per amount | match | 15 | services/payroll/runs.ts |
| 2939 | C1 | with reason | some-match | 15 | services/payroll/run-rules.ts |
| 2940 | C1 | approved payment | some-match | 15 | services/payroll/run-rules.ts |
| 2941 | C1 | pending/approved/paid | match | 15 | services/payroll/portal.ts |
| 2942 | C1 | add to payroll | some-match | 15 | services/payroll/run-rules.ts |
| 2943 | C1 | (Bengali only) | manual | 15 | - |
| 2944 | C2 | rent subscription insurance | match | 15 | config/s15-accounting.ts |
| 2945 | C2 | cron monthly | match | 15 | scripts/verify/step16-messaging.ts |
| 2946 | C2 | (Bengali only) | manual | 15 | - |
| 2947 | C2 | (Bengali only) | manual | 15 | - |
| 2948 | C3 | per category per role | some-match | 15 | app/(dashboard)/suppliers/new/page.tsx |
| 2949 | C3 | per day/per trip/per category | match | 15 | scripts/verify/step06-core.ts |
| 2950 | C3 | (Bengali only) | manual | 15 | - |
| 2951 | C3 | owner | manual | 15 | - |
| 2952 | C4 | per period | some-match | 15 | services/payroll/run-rules.ts |
| 2953 | C4 | (Bengali only) | manual | 15 | - |
| 2954 | C4 | (Bengali only) | manual | 15 | - |
| 2955 | C4 | (Bengali only) | manual | 15 | - |
| 2956 | C4 | MoM YoY | manual | 15 | - |
| 2957 | C4 | (Bengali only) | manual | 15 | - |
| 2958 | C4 | (Bengali only) | manual | 15 | - |
| 2959 | C4 | (Bengali only) | manual | 15 | - |
| 2960 | D1 | COA | no-match | 15 | - |
| 2961 | D1 | COA Asset/Liability/Equity/Revenue/Expense | match | 15 | services/accounting/report-rules.ts |
| 2962 | D1 | COA Current Asset/Fixed Asset/Current Liability/etc. | match | 15 | services/accounting/report-rules.ts |
| 2963 | D1 | COA hierarchical 1000 1100 1110 | some-match | 15 | config/s15-accounting.ts |
| 2964 | D1 | COA | no-match | 15 | - |
| 2965 | D1 | COA | no-match | 15 | - |
| 2966 | D1 | COA active/inactive | match | 15 | services/payroll/structures.ts |
| 2967 | D1 | COA service/retail/medical/SaaS | match | 15 | lib/i18n/strings/en/s15-accounting.ts |
| 2968 | D1 | COA CSV from QuickBooks/Xero | match | 15 | services/accounting/chart-rules.ts |
| 2969 | D1 | COA CSV | some-match | 15 | services/payroll/run-rules.ts |
| 2970 | D1 | COA changes tracked | match | 15 | migrations/S16_006_social_schedule.sql |
