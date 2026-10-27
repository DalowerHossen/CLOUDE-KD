<!-- path: docs/steps/STEP-16/AUDIT/PART-12.md -->
# Audit part 12 of 41: features 1090 to 1188

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 29, some-match 22, generic-match 0, no-match 0, manual 48. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 1090 | I3 | (Bengali only) | manual | 08 | - |
| 1091 | J1 | Shopify OAuth | match | 16 | services/integration/connections.ts |
| 1092 | J1 | Shopify URL API | match | 16 | migrations/S16_028_checkout_sessions.sql |
| 1093 | J1 | Shopify real-time | some-match | 16 | migrations/S16_028_checkout_sessions.sql |
| 1094 | J1 | Shopify | some-match | 16 | migrations/S16_028_checkout_sessions.sql |
| 1095 | J1 | Shopify client | some-match | 16 | migrations/S16_028_checkout_sessions.sql |
| 1096 | J1 | Shopify Shopify SKU KD product | match | 16 | lib/integrations/mapping-rules.ts |
| 1097 | J1 | Shopify | some-match | 16 | migrations/S16_028_checkout_sessions.sql |
| 1098 | J1 | Shopify KD | some-match | 16 | migrations/S16_028_checkout_sessions.sql |
| 1099 | J1 | Shopify KD | some-match | 16 | migrations/S16_028_checkout_sessions.sql |
| 1100 | J1 | Shopify per owner | some-match | 16 | migrations/S16_028_checkout_sessions.sql |
| 1101 | J1 | Shopify | some-match | 16 | migrations/S16_028_checkout_sessions.sql |
| 1102 | J2 | WooCommerce API key | match | 16 | lib/integrations/woocommerce.ts |
| 1103 | J2 | WooCommerce URL API | match | 16 | lib/integrations/woocommerce.ts |
| 1104 | J2 | WooCommerce | match | 16 | lib/integrations/woocommerce.ts |
| 1105 | J2 | WooCommerce | match | 16 | lib/integrations/woocommerce.ts |
| 1106 | J2 | WooCommerce | match | 16 | lib/integrations/woocommerce.ts |
| 1107 | J2 | WooCommerce | match | 16 | lib/integrations/woocommerce.ts |
| 1108 | J2 | WooCommerce | match | 16 | lib/integrations/woocommerce.ts |
| 1109 | J2 | WooCommerce | match | 16 | lib/integrations/woocommerce.ts |
| 1110 | J3 | success/failure per order | match | 16 | services/integration/connections.ts |
| 1111 | J3 | failed syncs auto manual | match | 16 | services/integration/commerce-orders.ts |
| 1112 | J3 | (Bengali only) | manual | 16 | - |
| 1113 | J3 | (Bengali only) | manual | 16 | - |
| 1114 | J3 | data mismatch | some-match | 16 | migrations/S02_003_locks.sql |
| 1115 | J3 | real-time/hourly/daily | match | 16 | services/payroll/runs.ts |
| 1116 | K1 | this month/last month/YTD | match | 09 | services/payroll/run-rules.ts |
| 1117 | K1 | Due/outstanding | match | 09 | services/budget/insights.ts |
| 1118 | K1 | Overdue amount count | match | 09 | scripts/verify/step16-automation.ts |
| 1119 | K1 | Paid this month | match | 09 | services/payroll/run-rules.ts |
| 1120 | K1 | last 10 | manual | 09 | - |
| 1121 | K1 | last 10 | manual | 09 | - |
| 1122 | K1 | create invoice add client record payment | match | 09 | services/payroll/runs.ts |
| 1123 | K1 | invoices clients payments products | some-match | 09 | scripts/verify/step11-verifone.ts |
| 1124 | K2 | Recharts monthly/weekly/daily | match | 09 | lib/payment/payout.ts |
| 1125 | K2 | paid vs outstanding | match | 09 | services/budget/insights.ts |
| 1126 | K2 | (Bengali only) | manual | 09 | - |
| 1127 | K2 | (Bengali only) | manual | 09 | - |
| 1128 | K2 | (Bengali only) | manual | 09 | - |
| 1129 | K2 | (Bengali only) | manual | 09 | - |
| 1130 | K2 | (Bengali only) | manual | 09 | - |
| 1131 | K3 | count amount | match | 09 | services/payroll/run-rules.ts |
| 1132 | K3 | (Bengali only) | manual | 09 | - |
| 1133 | K3 | (Bengali only) | manual | 09 | - |
| 1134 | K3 | (Bengali only) | manual | 09 | - |
| 1135 | K3 | viewed | some-match | 09 | config/s16-api.ts |
| 1136 | K3 | (Bengali only) | manual | 09 | - |
| 1137 | K3 | USD | some-match | 09 | services/payroll/run-rules.ts |
| 1138 | K3 | (Bengali only) | manual | 09 | - |
| 1139 | K3 | days | some-match | 09 | services/payroll/run-rules.ts |
| 1140 | K3 | (Bengali only) | manual | 09 | - |
| 1141 | K3 | (Bengali only) | manual | 09 | - |
| 1142 | K3 | click chart details | match | 09 | app/(dashboard)/subscriptions/billing/_components/retention-flow.tsx |
| 1143 | K4 | drag-drop customize | match | 09 | components/onboarding/logo-upload.tsx |
| 1144 | K4 | per user | manual | 09 | - |
| 1145 | K4 | manual auto | manual | 09 | - |
| 1146 | K4 | (Bengali only) | manual | 09 | - |
| 1147 | K4 | PDF snapshot | match | 09 | cron/jobs/s09-snapshots.ts |
| 1148 | L1 | period-based | some-match | 09 | services/payroll/run-rules.ts |
| 1149 | L1 | (Bengali only) | manual | 09 | - |
| 1150 | L1 | (Bengali only) | manual | 09 | - |
| 1151 | L1 | MoM YoY | manual | 09 | - |
| 1152 | L1 | (Bengali only) | manual | 09 | - |
| 1153 | L1 | (Bengali only) | manual | 09 | - |
| 1154 | L2 | (Bengali only) | manual | 09 | - |
| 1155 | L2 | (Bengali only) | manual | 09 | - |
| 1156 | L2 | (Bengali only) | manual | 09 | - |
| 1157 | L2 | AR 30/60/90/120+ days | some-match | 09 | services/payroll/run-rules.ts |
| 1158 | L2 | (Bengali only) | manual | 09 | - |
| 1159 | L2 | (Bengali only) | manual | 09 | - |
| 1160 | L3 | (Bengali only) | manual | 09,15 | - |
| 1161 | L3 | (Bengali only) | manual | 09,15 | - |
| 1162 | L3 | (Bengali only) | manual | 09,15 | - |
| 1163 | L3 | AP | manual | 09,15 | - |
| 1164 | L3 | (Bengali only) | manual | 09,15 | - |
| 1165 | L4 | (Bengali only) | manual | 09,15 | - |
| 1166 | L4 | VAT in/out net payable | match | 09,15 | services/taxfiling/reports.ts |
| 1167 | L4 | per jurisdiction | some-match | 09,15 | lib/compliance/retention.ts |
| 1168 | L4 | Withholding tax | match | 09,15 | services/invoice/prepare.ts |
| 1169 | L4 | per jurisdiction | some-match | 09,15 | lib/compliance/retention.ts |
| 1170 | L5 | (Bengali only) | manual | 09 | - |
| 1171 | L5 | (Bengali only) | manual | 09 | - |
| 1172 | L5 | (Bengali only) | manual | 09 | - |
| 1173 | L5 | (Bengali only) | manual | 09 | - |
| 1174 | L5 | (Bengali only) | manual | 09 | - |
| 1175 | L6 | (Bengali only) | manual | 09 | - |
| 1176 | L6 | COGS | some-match | 09 | migrations/S08_006_valuation.sql |
| 1177 | L6 | (Bengali only) | manual | 09 | - |
| 1178 | L6 | (Bengali only) | manual | 09 | - |
| 1179 | L7 | (Bengali only) | manual | 09 | - |
| 1180 | L7 | (Bengali only) | manual | 09 | - |
| 1181 | L7 | (Bengali only) | manual | 09 | - |
| 1182 | L7 | (Bengali only) | manual | 09 | - |
| 1183 | L8 | TOTAL row every report | match | 09 | services/payroll/run-rules.ts |
| 1184 | L8 | custom range | some-match | 09 | app/(dashboard)/suppliers/[id]/statement/page.tsx |
| 1185 | L8 | CSV | some-match | 09 | services/payroll/run-rules.ts |
| 1186 | L8 | PDF | some-match | 09 | services/payroll/run-rules.ts |
| 1187 | L8 | Excel | some-match | 09 | app/(dashboard)/payroll/reports/page.tsx |
| 1188 | L8 | daily/weekly/monthly | match | 09 | lib/payment/payout.ts |
