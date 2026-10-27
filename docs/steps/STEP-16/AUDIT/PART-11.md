<!-- path: docs/steps/STEP-16/AUDIT/PART-11.md -->
# Audit part 11 of 41: features 991 to 1089

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 25, some-match 24, generic-match 1, no-match 1, manual 48. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 991 | F2 | per tenant | manual | 08 | - |
| 992 | F3 | name email phone company | some-match | 08 | services/payroll/payroll-rules.ts |
| 993 | F3 | tag status balance country | match | 08 | sql/assertions/s08_002_client_search.sql |
| 994 | F3 | name balance last invoice created | some-match | 08 | app/api/integrations/settlement/payouts/[id]/route.ts |
| 995 | F3 | per user per list | manual | 08 | - |
| 996 | F3 | typo-tolerant | match | 08 | sql/assertions/s08_008_suppliers_orders.sql |
| 997 | F4 | all interactions | some-match | 08 | scripts/verify/step11-verifone.ts |
| 998 | F4 | (Bengali only) | manual | 08 | - |
| 999 | F4 | (Bengali only) | manual | 08 | - |
| 1000 | F4 | (Bengali only) | manual | 08 | - |
| 1001 | F4 | (Bengali only) | manual | 08 | - |
| 1002 | F4 | (Bengali only) | manual | 08 | - |
| 1003 | F4 | outstanding/overdue/credit | match | 08 | migrations/S08_002_client_search.sql |
| 1004 | F5 | PDF | some-match | 08 | services/payroll/run-rules.ts |
| 1005 | F5 | (Bengali only) | manual | 08 | - |
| 1006 | F5 | (Bengali only) | manual | 08 | - |
| 1007 | F5 | (Bengali only) | manual | 08 | - |
| 1008 | F6 | CSV with mapping wizard | match | 08 | migrations/S16_011_migration.sql |
| 1009 | F6 | CSV | some-match | 08 | services/payroll/run-rules.ts |
| 1010 | F6 | Excel xlsx | match | 08 | app/(dashboard)/payroll/reports/page.tsx |
| 1011 | F6 | name email fuzzy | some-match | 08 | services/product/search.ts |
| 1012 | F6 | merge two records | match | 08 | services/accounting/accounts.ts |
| 1013 | F6 | multi-select edit fields | some-match | 08 | services/payroll/runs.ts |
| 1014 | F6 | (Bengali only) | manual | 08 | - |
| 1015 | F6 | migration | some-match | 08 | services/integration/commerce-ports.ts |
| 1016 | F6 | (Bengali only) | manual | 08 | - |
| 1017 | F6 | (Bengali only) | manual | 08 | - |
| 1018 | F6 | payment behavior | some-match | 08 | lib/email/template-body.ts |
| 1019 | F6 | Do-not-contact per client all channels | match | 08 | services/messaging/channels.ts |
| 1020 | F6 | opt-out per client | match | 08 | migrations/S08_002_client_search.sql |
| 1021 | F6 | custom pricing | some-match | 08 | app/api/plans/route.ts |
| 1022 | F6 | who pays late | match | 08 | lib/cms/defaults/home.ts |
| 1023 | G1 | (Bengali only) | manual | 08 | - |
| 1024 | G1 | (Bengali only) | manual | 08 | - |
| 1025 | G1 | SKU | some-match | 08 | services/import/targets/products.ts |
| 1026 | G1 | USD | some-match | 08 | services/payroll/run-rules.ts |
| 1027 | G1 | default | manual | 08 | - |
| 1028 | G1 | hours/units/kg/miles/pieces | match | 08 | lib/catalog/products.ts |
| 1029 | G1 | (Bengali only) | manual | 08 | - |
| 1030 | G1 | HS/SAC optional | match | 08 | lib/i18n/strings/en/s08-crm.ts |
| 1031 | G1 | (Bengali only) | manual | 08 | - |
| 1032 | G1 | (Bengali only) | manual | 08 | - |
| 1033 | G2 | invoice line item | manual | 08 | - |
| 1034 | G2 | category price range status | match | 08 | scripts/verify/step16-public-api.ts |
| 1035 | G2 | (Bengali only) | manual | 08 | - |
| 1036 | G2 | from invoice form | manual | 08 | - |
| 1037 | G2 | CSV | some-match | 08 | services/payroll/run-rules.ts |
| 1038 | G2 | (Bengali only) | manual | 08 | - |
| 1039 | G2 | (Bengali only) | manual | 08 | - |
| 1040 | G2 | group of products | match | 08 | lib/i18n/strings/en/s08-crm.ts |
| 1041 | G2 | volume discount | match | 08 | lib/i18n/strings/en/s14-wallet.ts |
| 1042 | G2 | custom pricing per client | some-match | 08 | app/api/plans/route.ts |
| 1043 | H1 | per product per warehouse | match | 08 | sql/assertions/s08_009_supplier_bills.sql |
| 1044 | H1 | in/out/adjustment | match | 08 | services/estimate/pdf.ts |
| 1045 | H1 | on send | manual | 08 | - |
| 1046 | H1 | on paid | some-match | 08 | services/payroll/run-rules.ts |
| 1047 | H1 | threshold-based | some-match | 08 | app/(dashboard)/payroll/settings/page.tsx |
| 1048 | H1 | (Bengali only) | manual | 08 | - |
| 1049 | H1 | manual correction | some-match | 08 | sql/assertions/s08_005_inventory.sql |
| 1050 | H1 | damage/loss/return/correction | match | 08 | lib/stock/stock.ts |
| 1051 | H1 | row lock race condition prevention | some-match | 08 | scripts/verify/step15-periods.ts |
| 1052 | H1 | FIFO/Average/LIFO | match | 08 | lib/transfer/targets.ts |
| 1053 | H1 | (Bengali only) | manual | 08 | - |
| 1054 | H1 | COGS Cost of Goods Sold | match | 08 | lib/i18n/strings/en/s08-crm.ts |
| 1055 | H1 | (Bengali only) | manual | 08 | - |
| 1056 | H1 | (Bengali only) | manual | 08 | - |
| 1057 | H2 | (Bengali only) | manual | 08 | - |
| 1058 | H2 | (Bengali only) | manual | 08 | - |
| 1059 | H2 | (Bengali only) | manual | 08 | - |
| 1060 | H2 | warehouse A B | some-match | 08 | migrations/S08_006_valuation.sql |
| 1061 | H2 | (Bengali only) | manual | 08 | - |
| 1062 | H2 | per tenant | manual | 08 | - |
| 1063 | H3 | (Bengali only) | manual | 08 | - |
| 1064 | H3 | (Bengali only) | manual | 08 | - |
| 1065 | H3 | (Bengali only) | manual | 08 | - |
| 1066 | H3 | RMA | no-match | 08 | - |
| 1067 | H3 | (Bengali only) | manual | 08 | - |
| 1068 | H3 | SKU | some-match | 08 | services/import/targets/products.ts |
| 1069 | H3 | mobile | some-match | 08 | app/(dashboard)/suppliers/[id]/page.tsx |
| 1070 | I1 | (Bengali only) | manual | 08 | - |
| 1071 | I1 | name contact address tax ID | match | 08 | lib/procurement/suppliers.ts |
| 1072 | I1 | (Bengali only) | manual | 08 | - |
| 1073 | I1 | (Bengali only) | manual | 08 | - |
| 1074 | I1 | (Bengali only) | manual | 08 | - |
| 1075 | I1 | (Bengali only) | manual | 08 | - |
| 1076 | I1 | payable | some-match | 08 | lib/ocr/extract-rules.ts |
| 1077 | I2 | (Bengali only) | manual | 08 | - |
| 1078 | I2 | PO auto stock increase | some-match | 08 | services/invoice/send.ts |
| 1079 | I2 | PO product qty price | match | 08 | lib/credit/build.ts |
| 1080 | I2 | PO draft/sent/partial/received/cancelled | match | 08 | lib/procurement/orders.ts |
| 1081 | I2 | PO | manual | 08 | - |
| 1082 | I2 | PO PO-YYYY-NNNN | match | 08 | sql/assertions/s15_011_pay_runs.sql |
| 1083 | I2 | PO PDF send to supplier | match | 08 | services/accounting/report-tables.ts |
| 1084 | I2 | PO supplier-facing | generic-match | 08 | app/(dashboard)/suppliers/new/page.tsx |
| 1085 | I2 | PO | manual | 08 | - |
| 1086 | I3 | from PO or standalone | some-match | 08 | public/manifest.webmanifest |
| 1087 | I3 | (Bengali only) | manual | 08 | - |
| 1088 | I3 | Payable AP aging | match | 08 | services/accounting/report-rules.ts |
| 1089 | I3 | (Bengali only) | manual | 08 | - |
