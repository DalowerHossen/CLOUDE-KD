<!-- path: docs/steps/STEP-16/AUDIT/PART-22.md -->
# Audit part 22 of 41: features 2080 to 2178

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 39, some-match 39, generic-match 7, no-match 1, manual 13. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 2080 | B7 | with reason | some-match | 16 | services/payroll/run-rules.ts |
| 2081 | B7 | SLA auto-publish if not reviewed in X hours | match | 16 | lib/i18n/strings/en/s07-company.ts |
| 2082 | B7 | (Bengali only) | manual | 16 | - |
| 2083 | B8 | reach impressions engagement | generic-match | 16 | lib/domain/hostnames.ts |
| 2084 | B8 | (Bengali only) | manual | 16 | - |
| 2085 | B8 | (Bengali only) | manual | 16 | - |
| 2086 | B8 | weekly/monthly | match | 16 | migrations/S09_015_reports.sql |
| 2087 | B8 | this vs last period | match | 16 | services/payroll/run-rules.ts |
| 2088 | B8 | auto-identify | some-match | 16 | lib/analytics/start-provider.ts |
| 2089 | B8 | (Bengali only) | manual | 16 | - |
| 2090 | B8 | (Bengali only) | manual | 16 | - |
| 2091 | B8 | per platform | manual | 16 | - |
| 2092 | C1 | admin-editable | some-match | 16 | services/invoice/invoices.ts |
| 2093 | C1 | FB X LinkedIn WhatsApp Telegram Copy | match | 16 | lib/i18n/strings/en/s16-social.ts |
| 2094 | C1 | (Bengali only) | manual | 16 | - |
| 2095 | C1 | WhatsApp owner client | some-match | 16 | app/robots.ts |
| 2096 | C1 | any channel | some-match | 16 | scripts/verify/step12-adyen.ts |
| 2097 | C1 | Share your invoice client-facing branded | generic-match | 16 | scripts/verify/step09-calc.ts |
| 2098 | C1 | link banner email template | match | 16 | lib/i18n/strings/en/s07-company.ts |
| 2099 | C1 | X companies signed up this week | match | 16 | lib/i18n/strings/en/s13-portal.ts |
| 2100 | C1 | OG image title description | match | 16 | app/layout.tsx |
| 2101 | C1 | clipboard one-click | match | 16 | components/developers/webhook-forms.tsx |
| 2102 | C1 | per page/post | some-match | 16 | services/payroll/run-rules.ts |
| 2103 | D1 | RESTful v1 API OpenAPI 3.1 spec | some-match | 16 | scripts/verify/step07-core.ts |
| 2104 | D1 | API URL api.kdsolutionit.com/v1 | match | 16 | services/storage/drive-link.ts |
| 2105 | D1 | API Bearer token API key | match | 16 | app/api/cron/[job]/route.ts |
| 2106 | D1 | API per tenant owner only | some-match | 16 | app/sitemap.ts |
| 2107 | D1 | API instant | some-match | 16 | lib/integrations/mapping-rules.ts |
| 2108 | D1 | API read invoices write clients etc. | match | 16 | app/api/bills/route.ts |
| 2109 | D1 | API IP optional | some-match | 16 | services/payroll/run-rules.ts |
| 2110 | D1 | API optional | some-match | 16 | services/payroll/run-rules.ts |
| 2111 | D1 | API | some-match | 16 | app/sitemap.ts |
| 2112 | D1 | API requests/day per plan | match | 16 | services/payroll/runs.ts |
| 2113 | D2 | GET v1/invoices filter sort paginate | match | 16 | services/payroll/report-rules.ts |
| 2114 | D2 | POST v1/invoices | some-match | 16 | services/payroll/run-rules.ts |
| 2115 | D2 | GET v1/invoices/ id | manual | 16 | - |
| 2116 | D2 | PUT v1/invoices/ id | some-match | 16 | services/payroll/runs.ts |
| 2117 | D2 | DELETE v1/invoices/ id | manual | 16 | - |
| 2118 | D2 | POST v1/invoices/ id/send | some-match | 16 | services/payroll/run-rules.ts |
| 2119 | D2 | POST v1/invoices/ id/payment-link | some-match | 16 | services/payroll/runs.ts |
| 2120 | D2 | GET v1/clients | manual | 16 | - |
| 2121 | D2 | POST v1/clients | some-match | 16 | services/payroll/run-rules.ts |
| 2122 | D2 | GET v1/clients/ id | manual | 16 | - |
| 2123 | D2 | PUT v1/clients/ id | some-match | 16 | services/payroll/runs.ts |
| 2124 | D2 | DELETE v1/clients/ id | manual | 16 | - |
| 2125 | D2 | GET v1/products | some-match | 16 | scripts/verify/step11-verifone.ts |
| 2126 | D2 | POST v1/products | some-match | 16 | scripts/verify/step11-verifone.ts |
| 2127 | D2 | GET v1/payments | generic-match | 16 | services/payroll/runs.ts |
| 2128 | D2 | POST v1/payments | match | 16 | services/payroll/runs.ts |
| 2129 | D2 | POST v1/payments/ id/refund | some-match | 16 | scripts/verify/step12-nmi.ts |
| 2130 | D2 | GET v1/reports/ type | generic-match | 16 | services/payroll/run-rules.ts |
| 2131 | D2 | GET v1/estimates | some-match | 16 | app/(dashboard)/dashboard/page.tsx |
| 2132 | D2 | POST v1/estimates | some-match | 16 | app/(dashboard)/dashboard/page.tsx |
| 2133 | D2 | GET v1/subscriptions | some-match | 16 | scripts/verify/step12-nmi.ts |
| 2134 | D2 | GET v1/wallet/balance | match | 16 | scripts/verify/step14-ledger.sh |
| 2135 | D2 | GET v1/health API | some-match | 16 | lib/middleware/bot-detector.ts |
| 2136 | D3 | cursor limit has_more | some-match | 16 | services/product/search.ts |
| 2137 | D3 | field operator value | some-match | 16 | services/subscription/settings.ts |
| 2138 | D3 | sort field asc/desc | match | 16 | scripts/verify/step16-public-api.ts |
| 2139 | D3 | Sparse fieldsets fields id number total | match | 16 | components/onboarding/wizard.tsx |
| 2140 | D3 | include client items | some-match | 16 | services/payroll/runs.ts |
| 2141 | D3 | API per key per endpoint per minute | match | 16 | services/siem/siem-service.ts |
| 2142 | D3 | X-RateLimit- Limit Remaining Reset | match | 16 | migrations/S04_001_rate_limits_events.sql |
| 2143 | D3 | Retry-After on 429 | some-match | 16 | app/api/integrations/settlement/statement/route.ts |
| 2144 | D3 | API v1 v2 future | some-match | 16 | services/social/schedules.ts |
| 2145 | D3 | API deprecation 12-month notice | match | 16 | services/bnpl/installments.ts |
| 2146 | D3 | API versioned | some-match | 16 | migrations/S02_003_locks.sql |
| 2147 | D3 | stable documented | generic-match | 16 | migrations/S09_004_invoice_search.sql |
| 2148 | D3 | API RSS/JSON | match | 16 | app/(public)/blog/rss.xml/route.ts |
| 2149 | D3 | API JSON consistent envelope | match | 16 | services/webhookout/dispatch.ts |
| 2150 | D3 | API code message details correlation_id | match | 16 | scripts/verify/step12-nmi.ts |
| 2151 | D4 | API CMS-editable | generic-match | 16 | app/robots.ts |
| 2152 | D4 | API interactive try-it-out | some-match | 16 | services/payroll/runs.ts |
| 2153 | D4 | OpenAPI 3.1 downloadable | some-match | 16 | app/sitemap.ts |
| 2154 | D4 | Postman downloadable | no-match | 16 | - |
| 2155 | D4 | API cURL JavaScript Python PHP | match | 16 | scripts/verify/step04-core.ts |
| 2156 | D4 | API | some-match | 16 | app/sitemap.ts |
| 2157 | D4 | API isolated data | some-match | 16 | app/sitemap.ts |
| 2158 | D4 | API sandbox keys | some-match | 16 | scripts/verify/step12-nmi.ts |
| 2159 | D5 | per tenant multiple | some-match | 16 | scripts/verify/step11-stripe.ts |
| 2160 | D5 | URL HTTPS only | match | 16 | app/layout.tsx |
| 2161 | D5 | select events | some-match | 16 | services/payroll/run-rules.ts |
| 2162 | D5 | invoice.created invoice.sent invoice.paid | some-match | 16 | services/payroll/run-rules.ts |
| 2163 | D5 | invoice.overdue invoice.viewed | match | 16 | services/bnpl/offers.ts |
| 2164 | D5 | payment.received payment.failed payment.refunded | match | 16 | services/dispute/refund-requests.ts |
| 2165 | D5 | client.created client.updated | manual | 16 | - |
| 2166 | D5 | estimate.approved estimate.rejected | match | 16 | services/estimate/public.ts |
| 2167 | D5 | subscription.created subscription.cancelled | match | 16 | app/(dashboard)/subscriptions/[id]/page.tsx |
| 2168 | D5 | kyc.approved kyc.rejected | match | 16 | scripts/verify/step14-settlement.ts |
| 2169 | D5 | HMAC per webhook SHA-256 | match | 16 | lib/payment/adapters/paddle/webhook.ts |
| 2170 | D5 | zero-downtime | match | 16 | services/encryption/rotation.ts |
| 2171 | D5 | JSON consistent | generic-match | 16 | services/estimate/public.ts |
| 2172 | D5 | exponential backoff 5 attempts | match | 16 | lib/storage/adapters/base.ts |
| 2173 | D5 | failed deliveries | match | 16 | services/integration/commerce-webhook.ts |
| 2174 | D5 | per event per endpoint | match | 16 | services/integration/automation.ts |
| 2175 | D5 | success/failure/retry | match | 16 | services/payment/payments.ts |
| 2176 | D5 | send test event | match | 16 | services/payroll/run-rules.ts |
| 2177 | D5 | re-send failed event | match | 16 | services/payroll/runs.ts |
| 2178 | D5 | enable/disable per endpoint | match | 16 | app/(admin)/admin/siem/_components/siem-actions.tsx |
