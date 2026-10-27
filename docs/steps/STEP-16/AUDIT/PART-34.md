<!-- path: docs/steps/STEP-16/AUDIT/PART-34.md -->
# Audit part 34 of 41: features 3268 to 3366

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 40, some-match 26, generic-match 10, no-match 7, manual 16. Features outside every STEP line range: 10.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 3268 | D3 | (Bengali only) | manual | 03,04 | - |
| 3269 | D3 | (Bengali only) | manual | 03,04 | - |
| 3270 | D4 | signup disposable email list | match | 03,04 | services/auth/signup-flow.ts |
| 3271 | D4 | same IP multiple trials | generic-match | 03,04 | scripts/verify/step11-stripe.ts |
| 3272 | D4 | IP | manual | 03,04 | - |
| 3273 | D4 | (Bengali only) | manual | 03,04 | - |
| 3274 | D4 | (Bengali only) | manual | 03,04 | - |
| 3275 | D4 | self-referral block | match | 03,04 | services/product/products.ts |
| 3276 | D4 | (Bengali only) | manual | 03,04 | - |
| 3277 | D4 | abuse | some-match | 03,04 | config/security.ts |
| 3278 | D4 | public | some-match | 03,04 | app/layout.tsx |
| 3279 | D4 | DOS max body size | match | 03,04 | services/evidence/zip.ts |
| 3280 | D4 | zip-bomb decompression limit | match | 03,04 | scripts/verify/step05-files.ts |
| 3281 | D4 | admin toggle | some-match | 03,04 | components/layout/topbar.tsx |
| 3282 | E1 | (Bengali only) | manual | 05 | - |
| 3283 | E1 | real file type not extension | match | 05 | migrations/S16_037_job_scheduler.sql |
| 3284 | E1 | 5MB default configurable | no-match | 05 | - |
| 3285 | E1 | image/PDF/CSV/XLSX only | match | 05 | lib/storage/validate/limits.ts |
| 3286 | E1 | SVG remove scripts | match | 05 | components/shared/safe-html.tsx |
| 3287 | E1 | ClamAV integration async | generic-match | 05 | lib/storage/scanner.ts |
| 3288 | E1 | remove special chars | match | 05 | migrations/S08_003_client_privacy.sql |
| 3289 | E1 | block | some-match | 05 | app/(dashboard)/suppliers/[id]/statement/page.tsx |
| 3290 | E1 | Google Drive 6MB | match | 05 | migrations/S05_003_storage_adapters.sql |
| 3291 | E1 | presigned URL time-limited | match | 05 | services/email/sender.ts |
| 3292 | E1 | per tenant per plan | manual | 05 | - |
| 3293 | E1 | who uploaded/downloaded what | match | 05 | lib/i18n/strings/en/s13-portal.ts |
| 3294 | F | Referrer-Policy no-referrer | match | 04,13 | scripts/verify/step04-core.ts |
| 3295 | F | rel noopener noreferrer | match | 04,13 | app/(public)/blog/[slug]/page.tsx |
| 3296 | F | URL- PII no email/name in URL | match | 04,13 | services/siem/siem-service.ts |
| 3297 | F | bit random | match | 04,13 | lib/auth/tokens.ts |
| 3298 | F | never log full token | match | 04,13 | services/estimate/public.ts |
| 3299 | F | (Bengali only) | manual | 04,13 | - |
| 3300 | F | PDF- privacy | match | 04,13 | lib/i18n/strings/en/s16-ocr.ts |
| 3301 | F | (Bengali only) | manual | 04,13 | - |
| 3302 | F | (Bengali only) | manual | 04,13 | - |
| 3303 | F | (Bengali only) | manual | 04,13 | - |
| 3304 | G1 | GDPR Article 20 full data export | match | 02 | services/compliance/dsar.ts |
| 3305 | G1 | GDPR Article 17 right to erasure | match | 02 | lib/i18n/strings/en/s06-public.ts |
| 3306 | G1 | granular per purpose | some-match | 02 | lib/domain/hostnames.ts |
| 3307 | G1 | GDPR-compliant granular categories | match | 02 | lib/cms/defaults/legal.ts |
| 3308 | G1 | EU/US/Asia | some-match | 02 | scripts/verify/step16-modules.ts |
| 3309 | G1 | ROPA Article 30 | some-match | 02 | app/(public)/blog/[slug]/page.tsx |
| 3310 | G1 | DPO | no-match | 02 | - |
| 3311 | G1 | 72 hours | some-match | 02 | services/payroll/run-rules.ts |
| 3312 | G1 | DPIA | no-match | 02 | - |
| 3313 | G2 | CCPA Do Not Sell My Info | match | 02 | lib/cms/defaults/legal.ts |
| 3314 | G2 | CCPA | some-match | 02 | lib/compliance/jurisdictions.ts |
| 3315 | G2 | CCPA | some-match | 02 | lib/compliance/jurisdictions.ts |
| 3316 | G2 | CCPA | some-match | 02 | lib/compliance/jurisdictions.ts |
| 3317 | G3 | LGPD Brazil | match | 02 | lib/compliance/jurisdictions.ts |
| 3318 | G3 | PDPA Singapore | match | 02 | lib/compliance/jurisdictions.ts |
| 3319 | G3 | PIPEDA Canada | match | 02 | lib/compliance/jurisdictions.ts |
| 3320 | G3 | APPI Japan | match | 02 | lib/compliance/jurisdictions.ts |
| 3321 | G3 | PDPA Thailand | match | 02 | lib/compliance/jurisdictions.ts |
| 3322 | G3 | PDPB India | some-match | 02 | lib/compliance/jurisdictions.ts |
| 3323 | G3 | COPPA 13 block | some-match | 02 | app/(dashboard)/suppliers/[id]/statement/page.tsx |
| 3324 | G3 | 18+ for commercial accounts | no-match | 02 | - |
| 3325 | G4 | PII auto-mask in logs | match | 02 | services/portal/events.ts |
| 3326 | G4 | PII Sentry | generic-match | 02 | services/audit/request-meta.ts |
| 3327 | G4 | signed URL 1 hour | match | 02 | services/payroll/runs.ts |
| 3328 | G4 | prevent bulk download | match | 02 | components/settings/data-panel.tsx |
| 3329 | G4 | (Bengali only) | manual | 02 | - |
| 3330 | G4 | per data type | manual | 02 | - |
| 3331 | G4 | certificate of deletion | match | 02 | lib/i18n/strings/en/s07-company.ts |
| 3332 | G4 | CMS-editable | generic-match | 02 | app/robots.ts |
| 3333 | H | npm audit CI block on high/critical | match | 01 | migrations/S04_006_alerting_incidents.sql |
| 3334 | H | lockfile package-lock.json committed | match | 01 | scripts/check-secrets.sh |
| 3335 | H | Dependabot auto PR for security patches | some-match | 01 | app/layout.tsx |
| 3336 | H | SAST Semgrep/SonarQube CI | no-match | 01 | - |
| 3337 | H | DAST OWASP ZAP nightly | generic-match | 01 | lib/i18n/strings/en/s16-automation.ts |
| 3338 | H | MIT/Apache/BSD only | no-match | 01 | - |
| 3339 | H | SBOM Software Bill of Materials | match | 01 | lib/cms/defaults/about.ts |
| 3340 | H | deterministic builds | generic-match | 01 | lib/utils/uuid.ts |
| 3341 | H | main branch | generic-match | 01 | app/api/integrations/settlement/payouts/route.ts |
| 3342 | H | commit signing GPG | generic-match | 01 | scripts/gen.mjs |
| 3343 | H | Trivy CI | no-match | 01 | - |
| 3344 | H | quarterly | some-match | 01 | services/payroll/report-rules.ts |
| 3345 | H | bounty program | some-match | 01 | services/compliance/sanctions.ts |
| 3346 | H | Responsible disclosure | match | 01 | lib/cms/legal-pages.ts |
| 3347 | H | publication system | some-match | 01 | migrations/S05_008_notifications.sql |
| 3348 | I | raw-body | some-match | 04,10,16 | scripts/verify/step12-nmi.ts |
| 3349 | I | HMAC SHA-256 | match | 04,10,16 | lib/payment/card-rules.ts |
| 3350 | I | (Bengali only) | manual | 04,10,16 | - |
| 3351 | I | processed_events idempotency | match | 04,10,16 | migrations/S02_006_events_jobs.sql |
| 3352 | I | zero-downtime overlap | match | 04,10,16 | services/encryption/rotation.ts |
| 3353 | I | Slack/email | some-match | 04,10,16 | scripts/verify/step04-core.ts |
| 3354 | I | (Bengali only) | manual | 04,10,16 | - |
| 3355 | I | exponential backoff | match | 04,10,16 | lib/storage/adapters/base.ts |
| 3356 | I | URL HTTPS only no internal IPs | match | 04,10,16 | scripts/verify/step04-core.ts |
| 3357 | J1 | Lighthouse 90 CI check | some-match | - | services/payroll/run-rules.ts |
| 3358 | J1 | LCP 2.5s Largest Contentful Paint | generic-match | - | lib/i18n/strings/en/s10-payments.ts |
| 3359 | J1 | INP 200ms Interaction to Next Paint | generic-match | - | sql/assertions/s09_007_estimates.sql |
| 3360 | J1 | CLS 0.1 Cumulative Layout Shift | some-match | - | components/layout/shortcuts-dialog.tsx |
| 3361 | J1 | TTFB 800ms Time to First Byte | some-match | - | services/payroll/runs.ts |
| 3362 | J1 | FCP 1.8s First Contentful Paint | some-match | - | components/shared/theme-init-script.tsx |
| 3363 | J2 | analyzer webpack-bundle-analyzer | some-match | - | services/import/targets/products.ts |
| 3364 | J2 | route-based automatic | some-match | - | app/robots.ts |
| 3365 | J2 | dynamic import lazy | some-match | - | components/marketing/blocks/block-view.tsx |
| 3366 | J2 | Tree shaking unused code removal | match | - | services/hr/hr-rules.ts |
