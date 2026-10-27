<!-- path: docs/steps/STEP-16/AUDIT/PART-10.md -->
# Audit part 10 of 41: features 892 to 990

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 32, some-match 22, generic-match 4, no-match 1, manual 40. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 892 | C3 | PDF Google Drive | match | 09 | sql/assertions/s05_005_migrations.sql |
| 893 | C3 | PDF immutable legal record | match | 09 | lib/i18n/strings/en/s07-company.ts |
| 894 | C3 | (Bengali only) | manual | 09 | - |
| 895 | C3 | PDF per revision | match | 09 | lib/i18n/strings/en/s15-accounting.ts |
| 896 | C3 | PDF DRAFT/CANCELLED/Paid | match | 09 | lib/i18n/strings/en/s07-company.ts |
| 897 | D1 | (Bengali only) | manual | 09 | - |
| 898 | D1 | (Bengali only) | manual | 09 | - |
| 899 | D1 | one-click preserves data | generic-match | 09 | lib/middleware/bot-detector.ts |
| 900 | D1 | (Bengali only) | manual | 09 | - |
| 901 | D1 | estimate approval client signs | match | 09 | lib/company/sections.ts |
| 902 | D1 | cron | some-match | 09 | cron/jobs/s09-overdue.ts |
| 903 | D1 | (Bengali only) | manual | 09 | - |
| 904 | D1 | Google Drive | match | 09 | migrations/S05_003_storage_adapters.sql |
| 905 | D1 | draft/sent/viewed/approved/rejected/expired | match | 09 | services/estimate/public.ts |
| 906 | D1 | revisions | some-match | 09 | services/invoice/invoices.ts |
| 907 | D1 | (Bengali only) | manual | 09 | - |
| 908 | D1 | PDF branded | generic-match | 09 | services/payroll/run-rules.ts |
| 909 | D1 | client-facing | some-match | 09 | lib/middleware/bot-detector.ts |
| 910 | D2 | from invoice or standalone | some-match | 09 | public/manifest.webmanifest |
| 911 | D2 | auto-apply | some-match | 09 | scripts/verify/step16-automation.ts |
| 912 | D2 | PDF | some-match | 09 | services/payroll/run-rules.ts |
| 913 | D2 | (Bengali only) | manual | 09 | - |
| 914 | D2 | CN-YYYY-NNNN | match | 09 | sql/assertions/s15_011_pay_runs.sql |
| 915 | D2 | return/discount/adjustment | match | 09 | services/invoice/invoices.ts |
| 916 | D3 | (Bengali only) | manual | 09 | - |
| 917 | D3 | (Bengali only) | manual | 09 | - |
| 918 | D3 | PDF | some-match | 09 | services/payroll/run-rules.ts |
| 919 | D3 | DN-YYYY-NNNN | match | 09 | sql/assertions/s15_011_pay_runs.sql |
| 920 | D4 | pre-billing | match | 09 | app/(dashboard)/subscriptions/billing/invoices/[id]/page.tsx |
| 921 | D4 | (Bengali only) | manual | 09 | - |
| 922 | D4 | PDF marked PROFORMA | match | 09 | services/payroll/runs.ts |
| 923 | D4 | (Bengali only) | manual | 09 | - |
| 924 | D4 | PI-YYYY-NNNN | match | 09 | sql/assertions/s15_011_pay_runs.sql |
| 925 | D5 | (Bengali only) | manual | 09 | - |
| 926 | D5 | (Bengali only) | manual | 09 | - |
| 927 | D5 | e.g. 50 upfront | no-match | 09 | - |
| 928 | D5 | (Bengali only) | manual | 09 | - |
| 929 | D6 | frequency weekly/monthly/quarterly/yearly | match | 09 | lib/i18n/strings/en/s15-payroll.ts |
| 930 | D6 | cron | some-match | 09 | cron/jobs/s09-overdue.ts |
| 931 | D6 | optional | some-match | 09 | services/payroll/run-rules.ts |
| 932 | D6 | (Bengali only) | manual | 09 | - |
| 933 | D6 | (Bengali only) | manual | 09 | - |
| 934 | D6 | (Bengali only) | manual | 09 | - |
| 935 | D6 | Feb 28/29 | some-match | 09 | lib/ocr/extract-rules.ts |
| 936 | D6 | next 5 occurrences | some-match | 09 | migrations/S09_009_recurring.sql |
| 937 | D7 | split invoice into installments | match | 09 | lib/payment/bnpl-rules.ts |
| 938 | D7 | dates amounts | some-match | 09 | services/payroll/run-rules.ts |
| 939 | D7 | (Bengali only) | manual | 09 | - |
| 940 | D7 | (Bengali only) | manual | 09 | - |
| 941 | D7 | (Bengali only) | manual | 09 | - |
| 942 | E1 | (Bengali only) | manual | 09 | - |
| 943 | E1 | (Bengali only) | manual | 09 | - |
| 944 | E1 | hours/amount | match | 09 | services/payroll/run-rules.ts |
| 945 | E1 | active/on-hold/completed/cancelled | match | 09 | migrations/S09_012_projects.sql |
| 946 | E1 | milestones with dates | some-match | 09 | services/project/time.ts |
| 947 | E1 | staff members | some-match | 09 | services/invoice/send.ts |
| 948 | E1 | (Bengali only) | manual | 09 | - |
| 949 | E1 | (Bengali only) | manual | 09 | - |
| 950 | E1 | (Bengali only) | manual | 09 | - |
| 951 | E2 | start/stop/pause real-time | match | 09 | lib/i18n/strings/en/s16-whatsapp.ts |
| 952 | E2 | date hours description | match | 09 | services/payroll/structures.ts |
| 953 | E2 | (Bengali only) | manual | 09 | - |
| 954 | E2 | (Bengali only) | manual | 09 | - |
| 955 | E2 | (Bengali only) | manual | 09 | - |
| 956 | E2 | daily/weekly/monthly | match | 09 | lib/payment/payout.ts |
| 957 | E2 | staff owner | manual | 09 | - |
| 958 | E2 | after approval | some-match | 09 | scripts/verify/step16-automation.ts |
| 959 | E2 | localStorage sync | match | 09 | scripts/verify/step16-automation.ts |
| 960 | E2 | idle detection auto-pause | match | 09 | lib/i18n/strings/en/s04-security.ts |
| 961 | E2 | per staff/project/client | some-match | 09 | app/(dashboard)/dashboard/page.tsx |
| 962 | E3 | (Bengali only) | manual | 09 | - |
| 963 | E3 | per staff/per project/per client | some-match | 09 | app/(dashboard)/dashboard/page.tsx |
| 964 | E3 | per line item | manual | 09 | - |
| 965 | E3 | (Bengali only) | manual | 09 | - |
| 966 | E3 | milestone completion auto invoice | generic-match | 09 | services/project/time.ts |
| 967 | E3 | (Bengali only) | manual | 09 | - |
| 968 | E3 | reimbursable expenses invoice | match | 09 | services/project/expense-hook.ts |
| 969 | E3 | (Bengali only) | manual | 09 | - |
| 970 | E3 | unbilled hours alert | match | 09 | components/charts/dashboard-board.tsx |
| 971 | F1 | inline dialog or full page | generic-match | 08 | components/layout/sidebar.tsx |
| 972 | F1 | (Bengali only) | manual | 08 | - |
| 973 | F1 | soft delete archive | match | 08 | services/product/products.ts |
| 974 | F1 | hide from active lists | match | 08 | app/(dashboard)/subscriptions/page.tsx |
| 975 | F1 | (Bengali only) | manual | 08 | - |
| 976 | F1 | from invoice form | manual | 08 | - |
| 977 | F1 | walk-in customer quick create | match | 08 | services/accounting/chart-rules.ts |
| 978 | F1 | from invoice minimal fields | some-match | 08 | services/invoice/invoices.ts |
| 979 | F2 | company/individual | some-match | 08 | lib/whatsapp/rules.ts |
| 980 | F2 | (Bengali only) | manual | 08 | - |
| 981 | F2 | billing primary | match | 08 | app/(dashboard)/subscriptions/page.tsx |
| 982 | F2 | (Bengali only) | manual | 08 | - |
| 983 | F2 | billing shipping | match | 08 | migrations/S08_003_client_privacy.sql |
| 984 | F2 | (Bengali only) | manual | 08 | - |
| 985 | F2 | Tax ID VAT GST | match | 08 | scripts/verify/step09-calc.ts |
| 986 | F2 | display preference USD base | match | 08 | scripts/verify/step08-core.ts |
| 987 | F2 | override default | some-match | 08 | services/invoice/invoices.ts |
| 988 | F2 | internal | some-match | 08 | services/payroll/runs.ts |
| 989 | F2 | custom labels | some-match | 08 | services/payroll/report-rules.ts |
| 990 | F2 | initials/image | match | 08 | app/layout.tsx |
