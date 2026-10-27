<!-- path: docs/steps/STEP-16/AUDIT/PART-13.md -->
# Audit part 13 of 41: features 1189 to 1287

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 48, some-match 23, generic-match 3, no-match 1, manual 24. Features outside every STEP line range: 1.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 1189 | L8 | per user | manual | 09 | - |
| 1190 | L8 | this period vs last period | match | 09 | services/payroll/run-rules.ts |
| 1191 | M1 | before/after due date | some-match | 09 | services/bnpl/offers.ts |
| 1192 | M1 | (Bengali only) | manual | 09 | - |
| 1193 | M1 | Quiet hours no reminders 10pm-8am | match | 09 | cron/jobs/s09-reminders.ts |
| 1194 | M1 | Business-day due date skip weekends/holidays | match | 09 | lib/schedule/reminders.ts |
| 1195 | M1 | dunning 1st/2nd/3rd/final notice | match | 09 | config/s14-subscriptions.ts |
| 1196 | M1 | dunning | some-match | 09 | config/permissions.ts |
| 1197 | M1 | Promise-to-pay client commitment | generic-match | 09 | services/payroll/run-rules.ts |
| 1198 | M1 | internal | some-match | 09 | services/payroll/runs.ts |
| 1199 | M2 | percentage/fixed per day/month | match | 09 | lib/schedule/input.ts |
| 1200 | M2 | per client per invoice | manual | 09 | - |
| 1201 | M2 | (Bengali only) | manual | 09 | - |
| 1202 | M2 | owner override | some-match | 09 | services/invoice/invoices.ts |
| 1203 | M3 | Write-off bad debt with audit trail | match | 09 | lib/i18n/strings/en/s15-accounting.ts |
| 1204 | M3 | daily cron | match | 09 | cron/jobs/s09-fx.ts |
| 1205 | M3 | USD base | match | 09 | scripts/verify/step12-nmi.ts |
| 1206 | M3 | invoice date | some-match | 09 | services/payroll/run-rules.ts |
| 1207 | M3 | FX | manual | 09 | - |
| 1208 | M3 | dunning retry schedule | match | 09 | config/ownership.json |
| 1209 | M3 | (Bengali only) | manual | 09 | - |
| 1210 | N1 | (Bengali only) | manual | 09 | - |
| 1211 | N1 | federal state local | some-match | 09 | services/payroll/runs.ts |
| 1212 | N1 | (Bengali only) | manual | 09 | - |
| 1213 | N1 | US state sales tax per state | match | 09 | services/payroll/run-rules.ts |
| 1214 | N1 | VAT/GST seller client | match | 09 | migrations/S09_001_tax_fx.sql |
| 1215 | N1 | toggle | some-match | 09 | components/layout/topbar.tsx |
| 1216 | N1 | (Bengali only) | manual | 09 | - |
| 1217 | N1 | (Bengali only) | manual | 09 | - |
| 1218 | N1 | (Bengali only) | manual | 09 | - |
| 1219 | N1 | (Bengali only) | manual | 09 | - |
| 1220 | N1 | (Bengali only) | manual | 09 | - |
| 1221 | N2 | EU reverse-charge | match | 09 | services/invoice/prepare.ts |
| 1222 | N2 | VAT ID VIES | match | 09 | lib/tax/rules.ts |
| 1223 | N2 | US sales-tax nexus | match | 09 | lib/tax/templates.ts |
| 1224 | N2 | Marketplace facilitator | match | 09 | migrations/S09_001_tax_fx.sql |
| 1225 | N2 | 1099-K | manual | 09 | - |
| 1226 | N2 | (Bengali only) | manual | 09 | - |
| 1227 | N2 | GST India SST Malaysia VAT Vietnam | match | 09 | lib/tax/templates.ts |
| 1228 | N2 | fapiao China GST India | match | 09 | lib/tax/templates.ts |
| 1229 | N2 | COA | no-match | 09 | - |
| 1230 | O1 | checkbox | some-match | 08,09 | app/(dashboard)/subscriptions/[id]/page.tsx |
| 1231 | O1 | background processing | match | 08,09 | lib/i18n/strings/en/s16-system.ts |
| 1232 | O1 | real-time | manual | 08,09 | - |
| 1233 | O1 | (Bengali only) | manual | 08,09 | - |
| 1234 | O1 | one-click | some-match | 08,09 | lib/middleware/bot-detector.ts |
| 1235 | O1 | send later specific date/time | generic-match | 08,09 | lib/middleware/rate-limit.ts |
| 1236 | O1 | prevent double-send | some-match | 08,09 | app/(admin)/admin/incidents/_components/incident-actions.tsx |
| 1237 | O1 | (Bengali only) | manual | 08,09 | - |
| 1238 | O2 | soft delete | some-match | 08,09 | components/marketing/art/illustrations.tsx |
| 1239 | O2 | (Bengali only) | manual | 08,09 | - |
| 1240 | O2 | CSV/PDF/ZIP | match | 08,09 | lib/storage/validate/polyglot.ts |
| 1241 | O2 | (Bengali only) | manual | 08,09 | - |
| 1242 | O2 | Delete 47 invoices | manual | 08,09 | - |
| 1243 | A1 | abstract interface | some-match | 10 | services/base/duplicate-detector.ts |
| 1244 | A1 | JSON-driven per gateway | match | 10 | app/api/gateway/v1/[...path]/route.ts |
| 1245 | A1 | auto-discovery of installed gateways | match | 10 | services/alerting/alert-service.ts |
| 1246 | A1 | enable/disable per tenant per gateway | match | 10 | lib/i18n/strings/en/s04-security.ts |
| 1247 | A1 | per gateway | some-match | 10 | app/api/integrations/settlement/payouts/route.ts |
| 1248 | A1 | connection test per gateway | match | 10 | scripts/verify/step12-nmi.ts |
| 1249 | A1 | per gateway per transaction | match | 10 | scripts/verify/step12-nmi.ts |
| 1250 | A1 | per tenant | manual | 10 | - |
| 1251 | A1 | primary secondary tertiary manual | match | 10 | app/(dashboard)/client-mail/page.tsx |
| 1252 | A1 | client-facing dynamic | some-match | 10 | lib/middleware/bot-detector.ts |
| 1253 | A1 | admin plug any API | some-match | 10 | components/layout/icon-map.tsx |
| 1254 | A1 | per gateway | some-match | 10 | app/api/integrations/settlement/payouts/route.ts |
| 1255 | A1 | raw-body | some-match | 10 | scripts/verify/step12-nmi.ts |
| 1256 | A1 | HMAC | some-match | 10 | scripts/verify/step12-nmi.ts |
| 1257 | A1 | idempotency processed_events table | match | 10 | services/dispute/refund-requests.ts |
| 1258 | A1 | (Bengali only) | manual | 10 | - |
| 1259 | A1 | exponential backoff | match | 10 | lib/storage/adapters/base.ts |
| 1260 | A1 | per tenant | manual | - | - |
| 1261 | A2 | Stripe API publishable secret encrypted | match | 11 | scripts/verify/step11-stripe.ts |
| 1262 | A2 | Stripe Connect platform connected accounts | match | 11 | scripts/verify/step16-processor-health.ts |
| 1263 | A2 | Stripe Connect tenant choice | match | 11 | scripts/verify/step16-processor-health.ts |
| 1264 | A2 | Stripe Payment Intents API | match | 11 | lib/payment/adapters/stripe/webhook.ts |
| 1265 | A2 | Stripe Checkout Session hosted | match | 11 | scripts/verify/step11-stripe.ts |
| 1266 | A2 | Stripe Elements embedded card form | generic-match | 11 | sql/assertions/s13_009_evidence_packs.sql |
| 1267 | A2 | Stripe Webhooks payment_intent.succeeded charge.refunded etc. | match | 11 | lib/payment/adapters/stripe/webhook.ts |
| 1268 | A2 | Stripe API full partial | some-match | 11 | sql/assertions/s13_009_evidence_packs.sql |
| 1269 | A2 | Stripe | some-match | 11 | sql/assertions/s13_009_evidence_packs.sql |
| 1270 | A2 | Stripe KD client Stripe customer | some-match | 11 | sql/assertions/s13_009_evidence_packs.sql |
| 1271 | A2 | Stripe Payment Methods card bank wallet | match | 11 | config/ownership.json |
| 1272 | A2 | Stripe 3D Secure SCA compliance | some-match | 11 | scripts/verify/step11-stripe.ts |
| 1273 | A2 | Stripe Setup Intents save card for future | match | 11 | scripts/verify/step11-stripe.ts |
| 1274 | A2 | Stripe Billing subscription if needed | match | 11 | config/ownership.json |
| 1275 | A2 | Stripe Tax auto tax calculation optional | match | 11 | scripts/verify/step16-public-api.ts |
| 1276 | A2 | Stripe Radar fraud detection optional | match | 11 | scripts/verify/step04-core.ts |
| 1277 | A2 | Stripe Payout to bank MoR mode | match | 11 | scripts/verify/step10-flow.ts |
| 1278 | A2 | Stripe | some-match | 11 | sql/assertions/s13_009_evidence_packs.sql |
| 1279 | A3 | PayPal ID/ encrypted | match | 11 | lib/i18n/strings/en/s14-wallet.ts |
| 1280 | A3 | PayPal Orders API v2 | match | 11 | lib/payment/adapters/paypal.ts |
| 1281 | A3 | PayPal Checkout Smart Buttons | match | 11 | lib/payment/adapters/paypal.ts |
| 1282 | A3 | PayPal Webhooks PAYMENT.CAPTURE.COMPLETED etc. | match | 11 | lib/payment/adapters/paypal.ts |
| 1283 | A3 | PayPal API | match | 11 | lib/payment/adapters/paypal.ts |
| 1284 | A3 | PayPal | match | 11 | lib/payment/adapters/paypal.ts |
| 1285 | A3 | PayPal Payout API MoR mode | match | 11 | lib/payment/adapters/paypal.ts |
| 1286 | A3 | PayPal | match | 11 | lib/payment/adapters/paypal.ts |
| 1287 | A3 | PayPal | match | 11 | lib/payment/adapters/paypal.ts |
