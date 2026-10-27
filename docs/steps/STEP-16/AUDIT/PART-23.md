<!-- path: docs/steps/STEP-16/AUDIT/PART-23.md -->
# Audit part 23 of 41: features 2179 to 2277

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 53, some-match 24, generic-match 9, no-match 0, manual 13. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 2179 | D5 | overlap period | match | 16 | sql/assertions/s15_003_periods.sql |
| 2180 | E1 | Zapier Trigger invoice.created | match | 16 | migrations/S16_002_webhooks_out.sql |
| 2181 | E1 | Zapier Trigger invoice.paid | match | 16 | scripts/verify/step16-automation.ts |
| 2182 | E1 | Zapier Trigger client.created | match | 16 | migrations/S16_002_webhooks_out.sql |
| 2183 | E1 | Zapier Trigger payment.received | match | 16 | migrations/S16_002_webhooks_out.sql |
| 2184 | E1 | Zapier Trigger estimate.approved | match | 16 | lib/i18n/strings/en/s16-automation.ts |
| 2185 | E1 | Zapier Action create_invoice | some-match | 16 | migrations/S16_002_webhooks_out.sql |
| 2186 | E1 | Zapier Action create_client | some-match | 16 | migrations/S16_002_webhooks_out.sql |
| 2187 | E1 | Zapier Action send_invoice | some-match | 16 | migrations/S16_002_webhooks_out.sql |
| 2188 | E1 | Zapier Action record_payment | some-match | 16 | migrations/S16_002_webhooks_out.sql |
| 2189 | E1 | Zapier Action create_estimate | match | 16 | lib/integrations/public-registry.ts |
| 2190 | E1 | Zapier OAuth2 | generic-match | 16 | migrations/S16_002_webhooks_out.sql |
| 2191 | E1 | Zapier Zapier marketplace | generic-match | 16 | migrations/S16_002_webhooks_out.sql |
| 2192 | E2 | Make.com Triggers same as Zapier | match | 16 | scripts/verify/step16-automation.ts |
| 2193 | E2 | Make.com Actions same as Zapier | match | 16 | scripts/verify/step16-automation.ts |
| 2194 | E2 | Make.com OAuth2 | match | 16 | lib/payment/adapters/paypal/api.ts |
| 2195 | E2 | Make.com | some-match | 16 | scripts/verify/step12-nmi.ts |
| 2196 | E3 | Chrome Gmail/LinkedIn | generic-match | 16 | scripts/verify/step16-automation.ts |
| 2197 | E3 | Chrome toolbar | generic-match | 16 | scripts/verify/step16-automation.ts |
| 2198 | E3 | Chrome popup | match | 16 | scripts/verify/step16-automation.ts |
| 2199 | E3 | Chrome one-click | match | 16 | lib/integrations/chrome/extension/popup.js |
| 2200 | E3 | Chrome popup | match | 16 | scripts/verify/step16-automation.ts |
| 2201 | E3 | Chrome OAuth2 | match | 16 | scripts/verify/step03-core.ts |
| 2202 | E3 | Chrome | some-match | 16 | scripts/verify/step16-automation.ts |
| 2203 | E4 | dedicated site/section | match | 16 | lib/cms/defaults/legal.ts |
| 2204 | E4 | OAuth third-party developers | some-match | 16 | config/ownership.json |
| 2205 | E4 | marketplace | some-match | 16 | migrations/S09_001_tax_fx.sql |
| 2206 | E4 | SDK JavaScript/TypeScript npm package | match | 16 | components/payment/processors/paypal/index.tsx |
| 2207 | E4 | SDK Python pip package | generic-match | 16 | scripts/verify/step12-adyen.ts |
| 2208 | E4 | SDK PHP composer package WordPress ecosystem | match | 16 | scripts/verify/step05-files.ts |
| 2209 | E4 | SDK auto-generated | match | 16 | public/embed/v1/kd-checkout.js |
| 2210 | E4 | API v1 v2 | some-match | 16 | app/sitemap.ts |
| 2211 | E4 | API deprecation email headers | match | 16 | app/(client-portal)/skyc/[token]/page.tsx |
| 2212 | E4 | API usage anomaly detection per key | match | 16 | config/s16-api.ts |
| 2213 | E4 | Discord/Slack | match | 16 | migrations/S04_006_alerting_incidents.sql |
| 2214 | E4 | (Bengali only) | manual | 16 | - |
| 2215 | E4 | future | some-match | 16 | services/social/schedules.ts |
| 2216 | F1 | Plaid/Salt Edge/CSV | match | 16 | components/bankfeed/bank-forms.tsx |
| 2217 | F1 | Plaid Link | match | 16 | components/bankfeed/bank-forms.tsx |
| 2218 | F1 | owner bank | some-match | 16 | services/payroll/run-rules.ts |
| 2219 | F1 | per tenant | manual | 16 | - |
| 2220 | F1 | micro-deposit/Plaid | generic-match | 16 | config/s15-accounting.ts |
| 2221 | F1 | (Bengali only) | manual | 16 | - |
| 2222 | F1 | (Bengali only) | manual | 16 | - |
| 2223 | F1 | (Bengali only) | manual | 16 | - |
| 2224 | F2 | daily sync | match | 16 | cron/jobs/s09-fx.ts |
| 2225 | F2 | CSV/OFX/QFX | match | 16 | migrations/S15_006_reconciliation.sql |
| 2226 | F2 | hash-based | some-match | 16 | lib/middleware/idempotency.ts |
| 2227 | F2 | (Bengali only) | manual | 16 | - |
| 2228 | F2 | date amount description | match | 16 | services/payroll/structures.ts |
| 2229 | F3 | rule-based | manual | 16 | - |
| 2230 | F3 | confidence score per transaction | match | 16 | lib/ocr/vision.ts |
| 2231 | F3 | one-click accept | match | 16 | app/(admin)/admin/cms/_components/media-picker.tsx |
| 2232 | F3 | manual override | some-match | 16 | services/invoice/invoices.ts |
| 2233 | F3 | one-click match all suggested | match | 16 | lib/email/content.ts |
| 2234 | F3 | if description contains X category Y | match | 16 | services/product/products.ts |
| 2235 | F3 | manual review | some-match | 16 | lib/compliance/rules.ts |
| 2236 | F3 | bank vs ledger | match | 16 | scripts/verify/step16-settlement.ts |
| 2237 | F3 | monthly | some-match | 16 | app/sitemap.ts |
| 2238 | F3 | (Bengali only) | manual | 16 | - |
| 2239 | F3 | period-end | some-match | 16 | services/payroll/run-rules.ts |
| 2240 | G1 | vendor date amount tax items | match | 16 | lib/ocr/extract-rules.ts |
| 2241 | G1 | in-app auto-crop | some-match | 16 | app/robots.ts |
| 2242 | G1 | drag-drop multi-file | match | 16 | components/onboarding/logo-upload.tsx |
| 2243 | G1 | OCR rules | some-match | 16 | config/s16-ocr.ts |
| 2244 | G1 | expense category mapping | match | 16 | services/accounting/posting-rules.ts |
| 2245 | G1 | per field 0-100 | manual | 16 | - |
| 2246 | G1 | edit OCR results | match | 16 | services/expense/receipts.ts |
| 2247 | G1 | content hash | match | 16 | services/estimate/public.ts |
| 2248 | G1 | multiple receipts queue | match | 16 | cron/jobs/s16-ocr.ts |
| 2249 | G1 | OCR background async | generic-match | 16 | config/s16-ocr.ts |
| 2250 | G1 | OCR pending/processing/completed/failed | match | 16 | services/ocr/jobs.ts |
| 2251 | G2 | on OCR complete | match | 16 | components/ocr/settings-form.tsx |
| 2252 | G2 | optional | some-match | 16 | services/payroll/run-rules.ts |
| 2253 | G2 | staff owner approve | some-match | 16 | services/payroll/run-rules.ts |
| 2254 | G2 | expense record Google Drive | match | 16 | lib/cms/defaults/features.ts |
| 2255 | G2 | by vendor date amount OCR text | match | 16 | lib/ocr/extract-rules.ts |
| 2256 | G2 | spending by vendor/category | match | 16 | lib/i18n/strings/en/s15-accounting.ts |
| 2257 | H1 | pre-built custom | match | 13 | services/contract/templates.ts |
| 2258 | H1 | from template or blank | match | 13 | services/contract/schemas.ts |
| 2259 | H1 | client_name amount date terms | match | 13 | services/bnpl/settings.ts |
| 2260 | H1 | rich text editor | match | 13 | scripts/verify/step06-core.ts |
| 2261 | H1 | track changes | match | 13 | migrations/S08_006_valuation.sql |
| 2262 | H1 | draft/sent/viewed/signed/expired | match | 13 | services/contract/status.ts |
| 2263 | H1 | (Bengali only) | manual | 13 | - |
| 2264 | H1 | cron | some-match | 13 | cron/jobs/s09-overdue.ts |
| 2265 | H1 | Google Drive encrypted | match | 13 | services/storage/resolver.ts |
| 2266 | H1 | auto-create invoice from contract | some-match | 13 | services/payroll/runs.ts |
| 2267 | H1 | (Bengali only) | manual | 13 | - |
| 2268 | H2 | (Bengali only) | manual | 13 | - |
| 2269 | H2 | audit trail IP timestamp | generic-match | 13 | app/api/public-site/legal/accept/route.ts |
| 2270 | H2 | sequential/parallel | match | 13 | services/contract/schemas.ts |
| 2271 | H2 | signer 1 signer 2 | some-match | 13 | scripts/verify/step11-verifone.ts |
| 2272 | H2 | draw touch-friendly | match | 13 | components/client/signature-pad.tsx |
| 2273 | H2 | typed name | some-match | 13 | lib/payment/adapters/fastspring/webhook.ts |
| 2274 | H2 | (Bengali only) | manual | 13 | - |
| 2275 | H2 | PDF tamper-proof visual digital | match | 13 | lib/pdf/evidence-pack-pdf.tsx |
| 2276 | H2 | PDF embedded | match | 13 | lib/storage/validate/pdf.ts |
| 2277 | H2 | immutable timestamped | generic-match | 13 | migrations/S05_006_email.sql |
