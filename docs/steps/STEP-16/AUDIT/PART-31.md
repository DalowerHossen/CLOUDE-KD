<!-- path: docs/steps/STEP-16/AUDIT/PART-31.md -->
# Audit part 31 of 41: features 2971 to 3069

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 54, some-match 24, generic-match 3, no-match 3, manual 15. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 2971 | D1 | COA with audit trail | some-match | 15 | app/api/public-site/legal/accept/route.ts |
| 2972 | D1 | COA invoice revenue payment bank | match | 15 | sql/assertions/s15_003_periods.sql |
| 2973 | D1 | COA hierarchical display | some-match | 15 | config/s15-accounting.ts |
| 2974 | D1 | COA | no-match | 15 | - |
| 2975 | D1 | COA US GAAP IFRS India etc. | match | 15 | lib/i18n/strings/en/s15-accounting.ts |
| 2976 | D2 | manual debit/credit lines | match | 15 | scripts/verify/step14-ledger.sh |
| 2977 | D2 | draft only posted immutable | match | 15 | sql/assertions/s08_009_supplier_bills.sql |
| 2978 | D2 | draft only | some-match | 15 | scripts/verify/step16-automation.ts |
| 2979 | D2 | account debit credit description | match | 15 | lib/credit/input.ts |
| 2980 | D2 | total debit total credit | match | 15 | services/credit/credit-notes.ts |
| 2981 | D2 | staff accountant post | some-match | 15 | services/payroll/tax-settings.ts |
| 2982 | D2 | lock immutable | match | 15 | sql/assertions/s04_004_tokens.sql |
| 2983 | D2 | reversing entry audit trail | match | 15 | lib/i18n/strings/en/s15-accounting.ts |
| 2984 | D2 | auto-post monthly | some-match | 15 | app/sitemap.ts |
| 2985 | D2 | save for reuse | generic-match | 15 | services/payroll/structures.ts |
| 2986 | D2 | CSV | some-match | 15 | services/payroll/run-rules.ts |
| 2987 | D2 | every journal entry immutable | generic-match | 15 | services/payroll/run-rules.ts |
| 2988 | D2 | invoice/payment/payroll link | match | 15 | services/payroll/runs.ts |
| 2989 | D2 | internal | some-match | 15 | services/payroll/runs.ts |
| 2990 | D2 | receipt Google Drive | match | 15 | lib/cms/defaults/home.ts |
| 2991 | D2 | closed period block | match | 15 | lib/cms/defaults/features.ts |
| 2992 | D2 | admin/accountant only | some-match | 15 | services/payroll/tax-settings.ts |
| 2993 | D3 | AR Revenue | some-match | 15 | app/api/subscriptions/analytics/route.ts |
| 2994 | D3 | Bank AR | some-match | 15 | services/payroll/run-rules.ts |
| 2995 | D3 | Expense Bank/AP | match | 15 | sql/assertions/s15_005_expenses.sql |
| 2996 | D3 | Salary Expense Tax Payable Bank | match | 15 | config/s15-accounting.ts |
| 2997 | D3 | Revenue reversal Bank | match | 15 | lib/i18n/strings/en/s15-accounting.ts |
| 2998 | D3 | AR Revenue reversal | match | 15 | lib/i18n/strings/en/s15-accounting.ts |
| 2999 | D3 | (Bengali only) | manual | 15 | - |
| 3000 | D3 | Asset Bank | match | 15 | sql/assertions/s15_003_periods.sql |
| 3001 | D3 | Depreciation Expense Accumulated | match | 15 | migrations/S15_007_assets.sql |
| 3002 | D3 | FX auto monthly | some-match | 15 | app/sitemap.ts |
| 3003 | D3 | per transaction type | some-match | 15 | scripts/verify/step12-nmi.ts |
| 3004 | D3 | accountant review | match | 15 | services/accounting/posting.ts |
| 3005 | E1 | Profit Loss Income Statement | match | 15 | services/accounting/report-rules.ts |
| 3006 | E1 | P&L monthly/quarterly/yearly/custom | match | 15 | migrations/S15_008_budgets_entities.sql |
| 3007 | E1 | P&L this period vs last period | match | 15 | services/payroll/run-rules.ts |
| 3008 | E1 | P&L | manual | 15 | - |
| 3009 | E1 | P&L | manual | 15 | - |
| 3010 | E1 | P&L summary detail journal | match | 15 | lib/i18n/strings/en/s15-accounting.ts |
| 3011 | E1 | P&L PDF/CSV/Excel | match | 15 | services/payroll/reports.ts |
| 3012 | E1 | P&L visual | no-match | 15 | - |
| 3013 | E1 | P&L monthly to owner/accountant | match | 15 | lib/i18n/strings/en/s15-payroll.ts |
| 3014 | E2 | Statement of Financial Position | match | 15 | lib/cms/defaults/legal.ts |
| 3015 | E2 | as of date | some-match | 15 | services/payroll/run-rules.ts |
| 3016 | E2 | this vs last quarter/year | match | 15 | services/payroll/report-rules.ts |
| 3017 | E2 | (Bengali only) | manual | 15 | - |
| 3018 | E2 | PDF/CSV/Excel | match | 15 | services/payroll/reports.ts |
| 3019 | E2 | Assets Liabilities Equity | match | 15 | services/accounting/report-rules.ts |
| 3020 | E2 | asset composition | some-match | 15 | migrations/S15_007_assets.sql |
| 3021 | E3 | direct/indirect method | match | 15 | services/accounting/report-rules.ts |
| 3022 | E3 | Operating Activities | match | 15 | services/accounting/report-rules.ts |
| 3023 | E3 | Investing Activities | match | 15 | services/accounting/report-rules.ts |
| 3024 | E3 | Financing Activities | match | 15 | services/accounting/report-rules.ts |
| 3025 | E3 | (Bengali only) | manual | 15 | - |
| 3026 | E3 | this vs last period | match | 15 | services/payroll/run-rules.ts |
| 3027 | E3 | next 30/60/90 days | some-match | 15 | services/payroll/run-rules.ts |
| 3028 | E3 | PDF/CSV | match | 15 | services/payroll/run-rules.ts |
| 3029 | E4 | all accounts debit/credit | match | 15 | scripts/verify/step14-ledger.sh |
| 3030 | E4 | per account all transactions | some-match | 15 | scripts/verify/step12-nmi.ts |
| 3031 | E4 | per account running balance | match | 15 | lib/procurement/statement.ts |
| 3032 | E4 | AR 30/60/90/120+ days | some-match | 15 | services/payroll/run-rules.ts |
| 3033 | E4 | AP 30/60/90/120+ days | some-match | 15 | services/payroll/run-rules.ts |
| 3034 | E4 | (Bengali only) | manual | 15 | - |
| 3035 | E4 | (Bengali only) | manual | 15 | - |
| 3036 | E4 | (Bengali only) | manual | 15 | - |
| 3037 | E4 | (Bengali only) | manual | 15 | - |
| 3038 | E4 | all bank accounts | some-match | 15 | services/payroll/run-rules.ts |
| 3039 | E4 | collected vs paid | match | 15 | services/accounting/report-rules.ts |
| 3040 | E4 | current ratio quick ratio etc. | match | 15 | services/budget/report-tables.ts |
| 3041 | F1 | CSV/OFX/QFX | match | 15 | migrations/S15_006_reconciliation.sql |
| 3042 | F1 | daily via aggregator | match | 15 | lib/i18n/strings/en/s15-expenses.ts |
| 3043 | F1 | auto manual | manual | 15 | - |
| 3044 | F1 | amount date description | match | 15 | services/payroll/structures.ts |
| 3045 | F1 | one-click | some-match | 15 | lib/middleware/bot-detector.ts |
| 3046 | F1 | manual categorization | no-match | 15 | - |
| 3047 | F1 | match all suggested | match | 15 | lib/i18n/strings/en/s07-company.ts |
| 3048 | F1 | (Bengali only) | manual | 15 | - |
| 3049 | F1 | bank vs book | match | 15 | services/payroll/runs.ts |
| 3050 | F1 | (Bengali only) | manual | 15 | - |
| 3051 | F1 | lock period | match | 15 | migrations/S15_006_reconciliation.sql |
| 3052 | F1 | per account per month | some-match | 15 | services/payroll/run-rules.ts |
| 3053 | F1 | all past reconciliations | generic-match | 15 | cron/jobs/s09-overdue.ts |
| 3054 | G1 | name category purchase date cost | match | 15 | sql/assertions/s08_008_suppliers_orders.sql |
| 3055 | G1 | equipment furniture vehicle software building | match | 15 | migrations/S15_007_assets.sql |
| 3056 | G1 | office/branch | match | 15 | sql/assertions/s04_002_network_intel.sql |
| 3057 | G1 | (Bengali only) | manual | 15 | - |
| 3058 | G1 | (Bengali only) | manual | 15 | - |
| 3059 | G1 | Google Drive | match | 15 | migrations/S05_003_storage_adapters.sql |
| 3060 | G1 | active/disposed/sold | match | 15 | app/api/accounting/assets/route.ts |
| 3061 | G1 | CSV | some-match | 15 | services/payroll/run-rules.ts |
| 3062 | G2 | Straight Line/Declining Balance/Units of Production/Sum of Years | match | 15 | migrations/S15_007_assets.sql |
| 3063 | G2 | auto monthly | some-match | 15 | app/sitemap.ts |
| 3064 | G2 | per asset full life | match | 15 | migrations/S15_007_assets.sql |
| 3065 | G2 | auto-post monthly | some-match | 15 | app/sitemap.ts |
| 3066 | G2 | per asset per period | match | 15 | migrations/S15_007_assets.sql |
| 3067 | G2 | (Bengali only) | manual | 15 | - |
| 3068 | G2 | cost accumulated depreciation | match | 15 | sql/assertions/s15_007_assets.sql |
| 3069 | G2 | sale/scrap gain/loss calculation | match | 15 | lib/i18n/strings/en/s15-accounting.ts |
