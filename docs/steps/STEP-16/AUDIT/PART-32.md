<!-- path: docs/steps/STEP-16/AUDIT/PART-32.md -->
# Audit part 32 of 41: features 3070 to 3168

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 38, some-match 29, generic-match 5, no-match 2, manual 25. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 3070 | G2 | optional IFRS | match | 15 | lib/i18n/strings/en/s15-accounting.ts |
| 3071 | H1 | per department per category per period | match | 15 | services/payroll/payroll-rules.ts |
| 3072 | H1 | monthly/quarterly/yearly | match | 15 | migrations/S15_008_budgets_entities.sql |
| 3073 | H1 | real-time | manual | 15 | - |
| 3074 | H1 | 80 100 | manual | 15 | - |
| 3075 | H1 | mid-year adjustment | match | 15 | services/budget/budgets.ts |
| 3076 | H1 | (Bengali only) | manual | 15 | - |
| 3077 | H1 | variance analysis | some-match | 15 | cron/jobs/s15-budgets.ts |
| 3078 | H1 | based on trends | some-match | 15 | services/accounting/report-export.ts |
| 3079 | H1 | copy from last year | match | 15 | lib/ocr/extract-rules.ts |
| 3080 | H1 | period-end | some-match | 15 | services/payroll/run-rules.ts |
| 3081 | I1 | GAAP vs IFRS vs local | match | 15 | lib/i18n/strings/en/s15-accounting.ts |
| 3082 | I1 | per tenant | manual | 15 | - |
| 3083 | I1 | GAAP US | some-match | 15 | lib/i18n/strings/en/s15-accounting.ts |
| 3084 | I1 | IFRS International | generic-match | 15 | lib/i18n/strings/en/s15-accounting.ts |
| 3085 | I1 | accounting toggle | match | 15 | lib/i18n/strings/en/s01-core.ts |
| 3086 | I1 | accrued revenue/expense | match | 15 | config/s15-accounting.ts |
| 3087 | I1 | subscription advance | match | 15 | lib/cms/defaults/legal.ts |
| 3088 | I1 | (Bengali only) | manual | 15 | - |
| 3089 | I1 | auto month-end | some-match | 15 | services/payroll/run-rules.ts |
| 3090 | I2 | one tenant multiple legal entities | match | 15 | lib/i18n/strings/en/s07-company.ts |
| 3091 | I2 | (Bengali only) | manual | 15 | - |
| 3092 | I2 | consolidation | some-match | 15 | app/api/accounting/entities/statements/[kind]/export/route.ts |
| 3093 | I2 | (Bengali only) | manual | 15 | - |
| 3094 | I2 | (Bengali only) | manual | 15 | - |
| 3095 | I2 | FX translation | some-match | 15 | services/budget/consolidation-rules.ts |
| 3096 | J1 | fiscal year months | match | 15 | sql/assertions/s15_003_periods.sql |
| 3097 | J1 | Jan-Dec Apr-Mar Jul-Jun | match | 15 | lib/ocr/extract-rules.ts |
| 3098 | J1 | per month | some-match | 15 | services/payroll/run-rules.ts |
| 3099 | J1 | prevent backdated entries | generic-match | 15 | app/(admin)/admin/incidents/_components/incident-actions.tsx |
| 3100 | J1 | admin override with audit | some-match | 15 | services/invoice/invoices.ts |
| 3101 | J1 | per module AR/AP/GL | manual | 15 | - |
| 3102 | J1 | (Bengali only) | manual | 15 | - |
| 3103 | J1 | (Bengali only) | manual | 15 | - |
| 3104 | J1 | (Bengali only) | manual | 15 | - |
| 3105 | J1 | auto | manual | 15 | - |
| 3106 | J1 | for every journal entry immutable | generic-match | 15 | services/payroll/run-rules.ts |
| 3107 | J1 | sign-off period close | match | 15 | lib/cms/defaults/legal.ts |
| 3108 | J1 | auto-generated | some-match | 15 | scripts/integration-check.sh |
| 3109 | K1 | per jurisdiction per period | match | 15 | lib/i18n/strings/en/s15-accounting.ts |
| 3110 | K1 | VAT/GST input vs output | match | 15 | services/taxfiling/reports.ts |
| 3111 | K1 | Withholding Tax TDS per payee | match | 15 | lib/i18n/strings/en/s15-accounting.ts |
| 3112 | K1 | per quarter | some-match | 15 | lib/helpdesk/rules.ts |
| 3113 | K1 | 1099 US CSV/PDF | match | 15 | services/payroll/run-rules.ts |
| 3114 | K1 | W-2 US CSV/PDF | match | 15 | services/payroll/run-rules.ts |
| 3115 | K1 | quarterly | some-match | 15 | services/payroll/report-rules.ts |
| 3116 | K1 | paid vs due | match | 15 | scripts/verify/step16-automation.ts |
| 3117 | K1 | per jurisdiction | some-match | 15 | lib/compliance/retention.ts |
| 3118 | K1 | cron | some-match | 15 | cron/jobs/s09-overdue.ts |
| 3119 | K1 | jurisdiction-specific | generic-match | 15 | lib/compliance/retention.ts |
| 3120 | K1 | (Bengali only) | manual | 15 | - |
| 3121 | L1 | every transaction immutable | match | 15 | migrations/S02_005_approvals.sql |
| 3122 | L1 | who when what why | match | 15 | lib/cms/defaults/legal.ts |
| 3123 | L1 | COA changes | some-match | 15 | services/payroll/runs.ts |
| 3124 | L1 | (Bengali only) | manual | 15 | - |
| 3125 | L1 | who accessed what | some-match | 15 | services/payroll/runs.ts |
| 3126 | L1 | read-only per period | some-match | 15 | services/payroll/run-rules.ts |
| 3127 | L1 | (Bengali only) | manual | 15 | - |
| 3128 | L1 | for external auditor | match | 15 | services/accounting/audit-pack.ts |
| 3129 | L1 | Google Drive | match | 15 | migrations/S05_003_storage_adapters.sql |
| 3130 | L1 | super_admin accountant | some-match | 15 | services/payroll/tax-settings.ts |
| 3131 | L1 | petty cash register | match | 15 | services/accounting/report-export.ts |
| 3132 | L1 | US pre-printed checks | generic-match | 15 | lib/payment/adapters/fastspring/mapping.ts |
| 3133 | L1 | external payroll | match | 15 | app/api/payroll/reports/[report]/export/route.ts |
| 3134 | M1 | next 30/60/90 days | some-match | 15 | services/payroll/run-rules.ts |
| 3135 | M1 | based on AR/AP recurring | some-match | 15 | scripts/verify/step12-nmi.ts |
| 3136 | M1 | months of runway | match | 15 | services/budget/insights.ts |
| 3137 | M1 | low cash warning | match | 15 | services/budget/forecast.ts |
| 3138 | M1 | based on pipeline history | match | 15 | services/budget/report-tables.ts |
| 3139 | M1 | based on trends | some-match | 15 | services/accounting/report-export.ts |
| 3140 | M2 | gross/net per product/service | match | 15 | services/invoice/invoices.ts |
| 3141 | M2 | which clients are gold | some-match | 15 | scripts/verify/step08-core.ts |
| 3142 | M2 | ROI per project | some-match | 15 | app/(dashboard)/dashboard/page.tsx |
| 3143 | M2 | 10 by revenue | some-match | 15 | app/api/subscriptions/analytics/route.ts |
| 3144 | M2 | MoM YoY QoQ | manual | 15 | - |
| 3145 | M2 | (Bengali only) | manual | 15 | - |
| 3146 | M2 | (Bengali only) | manual | 15 | - |
| 3147 | M2 | (Bengali only) | manual | 15 | - |
| 3148 | M2 | (Bengali only) | manual | 15 | - |
| 3149 | M2 | (Bengali only) | manual | 15 | - |
| 3150 | M2 | ROE | some-match | 15 | scripts/verify/step07-core.ts |
| 3151 | M2 | ROA | no-match | 15 | - |
| 3152 | M2 | business financial health | match | 15 | services/budget/insights.ts |
| 3153 | M2 | Your top 3 overdue clients owe X | match | 15 | services/budget/insights.ts |
| 3154 | M2 | rule-based contextual | no-match | 15 | - |
| 3155 | A1 | company_id | manual | 02 | - |
| 3156 | A1 | Supabase RLS default-deny | match | 02 | migrations/S03_001_auth_tables.sql |
| 3157 | A1 | RLS deny all allow specific | match | 02 | migrations/S15_006_reconciliation.sql |
| 3158 | A1 | owner owner- absolute | some-match | 02 | app/robots.ts |
| 3159 | A1 | company_id server-side check | some-match | 02 | lib/payment/adapters/fastspring/webhook.ts |
| 3160 | A1 | ID 404 return no data leak | some-match | 02 | app/api/integrations/settlement/ingest-keys/[id]/route.ts |
| 3161 | A1 | users plans etc. | manual | 02 | - |
| 3162 | A1 | RLS SELECT auth wrap indexed | some-match | 02 | lib/supabase/admin.ts |
| 3163 | A1 | RLS quarterly review | match | 02 | sql/assertions/s16_020_sub_merchant_kyc.sql |
| 3164 | A1 | RLS automated per table | match | 02 | migrations/S15_002_posting.sql |
| 3165 | A2 | Google Drive folder per tenant | match | 02 | migrations/S05_003_storage_adapters.sql |
| 3166 | A2 | Google Drive tenant_id invoices/ tenant_id kyc/ tenant_id receipts/ | match | 02 | migrations/S05_002_files.sql |
| 3167 | A2 | Google Drive service account only | match | 02 | migrations/S05_003_storage_adapters.sql |
| 3168 | A2 | (Bengali only) | manual | 02 | - |
