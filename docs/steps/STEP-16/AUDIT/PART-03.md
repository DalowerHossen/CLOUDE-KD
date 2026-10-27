<!-- path: docs/steps/STEP-16/AUDIT/PART-03.md -->
# Audit part 3 of 41: features 199 to 297

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 34, some-match 28, generic-match 7, no-match 4, manual 26. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 199 | F3 | aria-live polite/assertive | match | 01 | app/(admin)/admin/impersonation/_components/start-form.tsx |
| 200 | F4 | user preference | some-match | 01 | app/api/notifications/route.ts |
| 201 | F4 | (Bengali only) | manual | 01 | - |
| 202 | F4 | prefers-reduced-motion | match | 01 | styles/globals.css |
| 203 | F4 | shapes colors | match | 01 | lib/company/steps.ts |
| 204 | F4 | optional | some-match | 01 | services/payroll/run-rules.ts |
| 205 | G1 | CTA | some-match | 06 | migrations/S06_007_marketing.sql |
| 206 | G1 | interactive | no-match | 06 | - |
| 207 | G1 | icons text | some-match | 06 | components/layout/sidebar.tsx |
| 208 | G1 | How it works 3-step process | match | 06 | scripts/verify/step16-settlement.ts |
| 209 | G1 | (Bengali only) | manual | 06 | - |
| 210 | G1 | carousel | no-match | 06 | - |
| 211 | G1 | Trusted by X companies | some-match | 06 | lib/storage/validate/magic.ts |
| 212 | G1 | wall customer logos | some-match | 06 | components/layout/sidebar.tsx |
| 213 | G1 | CTA bottom of page | generic-match | 06 | migrations/S06_007_marketing.sql |
| 214 | G1 | (Bengali only) | manual | 06 | - |
| 215 | G1 | visitor counter optional | match | 06 | lib/i18n/strings/en/s07-company.ts |
| 216 | G1 | Recently signed up live widget | match | 06 | lib/integrations/saltedge.ts |
| 217 | G2 | per feature | manual | 06 | - |
| 218 | G2 | Freelancers/Agencies/Retail | match | 06 | lib/company/presets.ts |
| 219 | G2 | per persona | no-match | 06 | - |
| 220 | G2 | KD vs QuickBooks | match | 06 | lib/migration/rules.ts |
| 221 | G2 | Switch from X | some-match | 06 | services/payroll/reports.ts |
| 222 | G3 | About | manual | 06 | - |
| 223 | G3 | optional | some-match | 06 | services/payroll/run-rules.ts |
| 224 | G3 | optional | some-match | 06 | services/payroll/run-rules.ts |
| 225 | G3 | ticket fallback | generic-match | 06 | lib/helpdesk/rules.ts |
| 226 | G3 | (Bengali only) | manual | 06 | - |
| 227 | G3 | (Bengali only) | manual | 06 | - |
| 228 | G3 | (Bengali only) | manual | 06 | - |
| 229 | G4 | Terms of Service | some-match | 06 | scripts/verify/step16-settlement.ts |
| 230 | G4 | Privacy Policy | match | 06 | app/api/clients/[id]/statement-mail/route.ts |
| 231 | G4 | Refund Policy | match | 06 | scripts/verify/step11-stripe.ts |
| 232 | G4 | Cookie Policy | match | 06 | config/security.ts |
| 233 | G4 | DPA Data Processing Agreement | match | 06 | lib/cms/defaults/legal.ts |
| 234 | G4 | SLA Uptime Commitment | match | 06 | lib/i18n/strings/en/s06-public.ts |
| 235 | G4 | (Bengali only) | manual | 06 | - |
| 236 | G4 | Acceptable Use Policy | match | 06 | scripts/verify/step06-core.ts |
| 237 | G4 | GDPR Compliance | match | 06 | lib/compliance/jurisdictions.ts |
| 238 | G4 | CCPA Compliance | match | 06 | lib/compliance/jurisdictions.ts |
| 239 | G4 | (Bengali only) | manual | 06 | - |
| 240 | G4 | (Bengali only) | manual | 06 | - |
| 241 | G5 | FAQ FAQ | some-match | 06 | scripts/verify/step06-core.ts |
| 242 | G5 | Problem-solving | some-match | 06 | services/payroll/run-rules.ts |
| 243 | G5 | searchable | some-match | 06 | services/supplier/suppliers.ts |
| 244 | G5 | CMS-driven | generic-match | 06 | app/robots.ts |
| 245 | G5 | (Bengali only) | manual | 06 | - |
| 246 | G5 | support kdsolutionit.com CMS | match | 06 | lib/cms/defaults/contact.ts |
| 247 | G5 | (Bengali only) | manual | 06 | - |
| 248 | G6 | (Bengali only) | manual | 06 | - |
| 249 | G6 | uptime incidents | match | 06 | components/marketing/status-view.tsx |
| 250 | G6 | (Bengali only) | manual | 06 | - |
| 251 | G6 | CMS-driven | generic-match | 06 | app/robots.ts |
| 252 | G6 | Changelog subscribe | match | 06 | lib/i18n/strings/en/s06-public.ts |
| 253 | G6 | (Bengali only) | manual | 06 | - |
| 254 | G7 | no login lead magnet | match | 06 | types/contracts/common.ts |
| 255 | G7 | markup discount tax | match | 06 | scripts/verify/step15-portal.ts |
| 256 | G7 | ROI hours saved | match | 06 | services/payroll/runs.ts |
| 257 | G7 | customizable | no-match | 06 | - |
| 258 | G7 | Demo Contact Sales | match | 06 | scripts/verify/step08-core.ts |
| 259 | G7 | booking | some-match | 06 | services/asset/assets.ts |
| 260 | G7 | invoice/estimate | some-match | 06 | app/(dashboard)/dashboard/page.tsx |
| 261 | G7 | (Bengali only) | manual | 06 | - |
| 262 | G8 | SEO per page CMS-editable | match | 06 | app/robots.ts |
| 263 | G8 | OpenGraph | some-match | 06 | app/layout.tsx |
| 264 | G8 | Twitter Card metadata | match | 06 | app/layout.tsx |
| 265 | G8 | sitemap.xml dynamic | match | 06 | app/robots.ts |
| 266 | G8 | robots.txt admin-editable | match | 06 | scripts/verify/step07-core.ts |
| 267 | G8 | URL | some-match | 06 | app/robots.ts |
| 268 | G8 | hreflang future i18n | generic-match | 06 | services/social/schedules.ts |
| 269 | G8 | search bar | match | 06 | config/nav-types.ts |
| 270 | G8 | auto-report | generic-match | 06 | services/payroll/run-rules.ts |
| 271 | G8 | permission denied | some-match | 06 | components/client/refund-request-list.tsx |
| 272 | G8 | 429 rate limited | match | 06 | app/(client-portal)/p/[token]/page.tsx |
| 273 | G8 | maintenance | some-match | 06 | lib/api/with-api.ts |
| 274 | H1 | English-only UI strict | some-match | 01 | scripts/check-all.sh |
| 275 | H1 | Bengali-detection CI block | match | 01 | lib/ocr/vision.ts |
| 276 | H1 | Non-ASCII script detection pre-commit hook | match | 01 | scripts/verify/step04-core.ts |
| 277 | H1 | strings single source | some-match | 01 | scripts/verify/step16-automation.ts |
| 278 | H1 | (Bengali only) | manual | 01 | - |
| 279 | H1 | UI/DB seed/ | some-match | 01 | services/accounting/accounts.ts |
| 280 | H1 | (Bengali only) | manual | 01 | - |
| 281 | H1 | CMS | some-match | 01 | app/robots.ts |
| 282 | H1 | (Bengali only) | manual | 01 | - |
| 283 | H2 | lorem | some-match | 01 | scripts/check-no-coming-soon.sh |
| 284 | H2 | (Bengali only) | manual | 01 | - |
| 285 | H2 | error/success | some-match | 01 | services/payroll/runs.ts |
| 286 | H2 | (Bengali only) | manual | 01 | - |
| 287 | H2 | CMS | some-match | 01 | app/robots.ts |
| 288 | H2 | (Bengali only) | manual | 01 | - |
| 289 | H2 | (Bengali only) | manual | 01 | - |
| 290 | H3 | CI check | some-match | 01 | services/payroll/run-rules.ts |
| 291 | H3 | hook | some-match | 01 | scripts/verify/step12-nmi.ts |
| 292 | H3 | invoice/estimate/quote glossary | match | 01 | services/estimate/estimates.ts |
| 293 | H3 | (Bengali only) | manual | 01 | - |
| 294 | H3 | (Bengali only) | manual | 01 | - |
| 295 | H4 | i18n next-intl ready hidden | match | 01 | app/(dashboard)/settings/storage/page.tsx |
| 296 | H4 | future-proof | match | 01 | scripts/verify/step04-core.ts |
| 297 | H4 | RTL Arabic/Hebrew future | generic-match | 01 | types/contracts/security.ts |
