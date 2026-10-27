<!-- path: docs/steps/STEP-16/AUDIT/PART-33.md -->
# Audit part 33 of 41: features 3169 to 3267

First pass, made by a script: the words of each feature are looked for in the code (paths and contents of `app`, `components`, `lib`, `services`, `config`, `cron`, `migrations`, `scripts`, `sql`, `public`).
It is a map to the likely files, not a verdict: a match does not prove that the feature works, and a missing word does not prove that it is missing (the code may use other words, and a line in Bengali only has nothing to look for).

| Status | Meaning |
|---|---|
| match | at least three of its words meet in one file |
| some-match | two words meet, or its one specific word is found |
| generic-match | only common words are found, nothing specific |
| no-match | none of its words is found in the code |
| manual | the line has no English word, a person must read it |

Totals: match 67, some-match 18, generic-match 6, no-match 0, manual 8. Features outside every STEP line range: 0.

| No | Section | English words of the feature | Status | STEP | Best file |
|---|---|---|---|---|---|
| 3169 | A2 | prevent path traversal | generic-match | 02 | app/(admin)/admin/incidents/_components/incident-actions.tsx |
| 3170 | A2 | who accessed what file | match | 02 | services/payroll/runs.ts |
| 3171 | A3 | CI every PR | manual | 02 | - |
| 3172 | A3 | random ID injection | generic-match | 02 | lib/middleware/headers.ts |
| 3173 | A3 | (Bengali only) | manual | 02 | - |
| 3174 | A3 | API endpoint per endpoint | some-match | 02 | scripts/verify/step16-automation.ts |
| 3175 | A3 | (Bengali only) | manual | 02 | - |
| 3176 | A3 | super_admin enforced tested | generic-match | 02 | config/auth-lock.ts |
| 3177 | A3 | CI- block merge if fail | match | 02 | scripts/verify/step09-core.ts |
| 3178 | B1 | AES-256-GCM | match | 05 | services/encryption/encryption-service.ts |
| 3179 | B1 | gateway keys bank accounts tax IDs SSN/TIN | match | 05 | config/features.ts |
| 3180 | B1 | SMTP passwords API keys OAuth tokens | match | 05 | lib/env/s01.ts |
| 3181 | B1 | KYC documents metadata | match | 05 | services/kyc/settings.ts |
| 3182 | B1 | Google Drive- AES-256 client-side before upload | match | 05 | lib/cms/defaults/legal.ts |
| 3183 | B1 | Supabase at-rest Supabase managed | match | 05 | services/contract/send-gate.ts |
| 3184 | B1 | at-rest audit | some-match | 05 | scripts/verify/step12-nmi.ts |
| 3185 | B1 | pg_dump encrypted | match | 05 | scripts/restore.sh |
| 3186 | B1 | client-side Google Drive | match | 05 | lib/cms/defaults/legal.ts |
| 3187 | B1 | abstract | some-match | 05 | services/base/duplicate-detector.ts |
| 3188 | B1 | ENCRYPTION_KEY immutable | match | 05 | migrations/S05_001_encryption.sql |
| 3189 | B1 | annual zero-downtime | match | 05 | services/payroll/report-rules.ts |
| 3190 | B1 | key-version future rotation | generic-match | 05 | services/social/schedules.ts |
| 3191 | B1 | KMS layer plug HashiCorp Vault/AWS KMS future | some-match | 05 | components/layout/icon-map.tsx |
| 3192 | B1 | keypair never trust single provider | match | 05 | scripts/verify/step04-core.ts |
| 3193 | B2 | service_role never client bundle | match | 05 | services/payment/payments.ts |
| 3194 | B2 | CI | manual | 05 | - |
| 3195 | B2 | ENV boot-time fail-fast | match | 05 | lib/env/index.ts |
| 3196 | B2 | ENV fail-fast no silent fallback | match | 05 | lib/env/index.ts |
| 3197 | B2 | per-environment dev/staging/prod | match | 05 | scripts/verify/step16-bankfeed.ts |
| 3198 | B2 | who read which secret | match | 05 | sql/assertions/s16_003_whatsapp.sql |
| 3199 | B2 | ENV enforced by middleware | match | 05 | app/layout.tsx |
| 3200 | B2 | CI- gitleaks trufflehog | some-match | 05 | scripts/check-secrets.sh |
| 3201 | B2 | Pre-commit secret scan hook | match | 05 | lib/email/content.ts |
| 3202 | B2 | quarterly non-encryption keys | match | 05 | scripts/verify/step09-core.ts |
| 3203 | C1 | SQL parameterized queries always | match | 04 | migrations/S05_006_email.sql |
| 3204 | C1 | Supabase client no raw SQL from client | match | 04 | migrations/S02_001_foundation.sql |
| 3205 | C1 | type-safe | some-match | 04 | services/payroll/runs.ts |
| 3206 | C1 | SQL CI SAST | some-match | 04 | services/accounting/reports.ts |
| 3207 | C1 | SQL per endpoint nightly | match | 04 | migrations/S04_005_siem.sql |
| 3208 | C1 | whitelist columns/tables | some-match | 04 | lib/payment/adapters/payproglobal.ts |
| 3209 | C1 | UNION/SELECT/INSERT/UPDATE/DELETE keyword block input | match | 04 | services/siem/siem-service.ts |
| 3210 | C1 | SQL attempt detected notify admin | match | 04 | migrations/S04_006_alerting_incidents.sql |
| 3211 | C2 | XSS React auto-escapes | match | 04 | scripts/verify/step13-contracts.ts |
| 3212 | C2 | XSS DOMPurify rich text | match | 04 | scripts/verify/step04-core.ts |
| 3213 | C2 | server-side client-side | some-match | 04 | lib/payment/adapters/fastspring/webhook.ts |
| 3214 | C2 | XSS per input field nightly | generic-match | 04 | lib/security/zero-trust.ts |
| 3215 | C2 | Inline script block CSP enforced | match | 04 | scripts/verify/step04-core.ts |
| 3216 | C2 | Event handler block onerror onload etc. | match | 04 | scripts/verify/step04-core.ts |
| 3217 | C2 | SVG uploaded files | match | 04 | scripts/verify/step13-esign.ts |
| 3218 | C2 | HTML all text fields | some-match | 04 | scripts/verify/step16-automation.ts |
| 3219 | C3 | CSRF double-submit cookie | match | 04 | lib/middleware/csrf.ts |
| 3220 | C3 | CSRF per session | match | 04 | config/security.ts |
| 3221 | C3 | SameSite Strict all auth cookies | match | 04 | services/cms/legal.ts |
| 3222 | C3 | Origin/Referer state-changing requests | match | 04 | lib/middleware/csrf.ts |
| 3223 | C3 | CSRF CI | some-match | 04 | app/layout.tsx |
| 3224 | C4 | SSRF webhook URL validation | match | 04 | scripts/verify/step16-automation.ts |
| 3225 | C4 | SSRF ecommerce store URL validation | match | 04 | services/payment/health.ts |
| 3226 | C4 | SSRF custom domain validation | match | 04 | scripts/verify/step16-webhooks-out.ts |
| 3227 | C4 | Internal IP block 10.x 172.16.x 192.168.x 127.x | match | 04 | services/fraud/admin-ops.ts |
| 3228 | C4 | URL scheme whitelist https only | match | 04 | app/layout.tsx |
| 3229 | C4 | DNS rebinding | match | 04 | lib/security/ssrf.ts |
| 3230 | C4 | SSRF CI | some-match | 04 | scripts/verify/step16-automation.ts |
| 3231 | C5 | CSP Content-Security-Policy nonce- | match | 04 | scripts/verify/step04-core.ts |
| 3232 | C5 | X-Frame-Options X-Content-Type-Options X-XSS-Protection | match | 04 | lib/security/headers.ts |
| 3233 | C5 | Clickjacking frame-ancestors none | match | 04 | scripts/verify/step04-core.ts |
| 3234 | C5 | CORS specific origins only | match | 04 | public/embed/v1/kd-checkout.js |
| 3235 | C5 | whitelist redirect URLs | match | 04 | lib/payment/adapters/payproglobal.ts |
| 3236 | C5 | Mass-assignment zod strip unknown fields | match | 04 | lib/security/zod-strict.ts |
| 3237 | C5 | Object.freeze schema validation | match | 04 | services/invoice/send.ts |
| 3238 | C5 | ReDoS- regex lint check timeout | match | 04 | services/siem/siem-service.ts |
| 3239 | C5 | HTTP Strict Transport Security HSTS 1 year | match | 04 | scripts/verify/step04-core.ts |
| 3240 | C5 | Referrer-Policy strict-origin-when-cross-origin | match | 04 | scripts/verify/step04-core.ts |
| 3241 | C5 | Permissions-Policy camera microphone geolocation | match | 04 | lib/security/headers.ts |
| 3242 | C5 | X-Content-Type-Options nosniff | match | 04 | app/.well-known/security.txt/route.ts |
| 3243 | C5 | Content Disarm and Reconstruction CDR uploaded files | match | 04 | services/storage/files.ts |
| 3244 | C5 | IDOR ownership check every endpoint | match | 04 | components/settings/kyc-panel.tsx |
| 3245 | C5 | UI | manual | 04 | - |
| 3246 | D1 | API endpoint- | some-match | 03,04 | scripts/verify/step16-automation.ts |
| 3247 | D1 | API per endpoint per user per IP | some-match | 03,04 | scripts/verify/step16-automation.ts |
| 3248 | D1 | X-RateLimit- Retry-After | match | 03,04 | services/integration/commerce-webhook.ts |
| 3249 | D1 | Supabase Upstash Redis adapter future | match | 03,04 | services/security/rate-limit.ts |
| 3250 | D1 | atomic counter | match | 03,04 | sql/assertions/s04_001_rate_limits.sql |
| 3251 | D1 | suspended rate-limit custom branded | match | 03,04 | services/gateway/ingest.ts |
| 3252 | D1 | per tenant admin | manual | 03,04 | - |
| 3253 | D2 | 5 failed 15 min lock | match | 03,04 | services/ocr/jobs.ts |
| 3254 | D2 | lock duration increases | match | 03,04 | services/fraud/reaction.ts |
| 3255 | D2 | too many logins per hour | match | 03,04 | sql/assertions/s03_lock_state.sql |
| 3256 | D2 | IP- | manual | 03,04 | - |
| 3257 | D2 | Cloudflare Turnstile signup/login/forgot | match | 03,04 | scripts/verify/step04-core.ts |
| 3258 | D2 | after 3 failed attempts | match | 03,04 | services/integration/commerce-webhook.ts |
| 3259 | D2 | unusual IP/location | generic-match | 03,04 | services/auth/actor.ts |
| 3260 | D2 | audit trail | some-match | 03,04 | app/api/public-site/legal/accept/route.ts |
| 3261 | D3 | hidden bot trap | match | 03,04 | services/cms/contact.ts |
| 3262 | D3 | FingerprintJS | some-match | 03,04 | lib/payment/adapters/fastspring/mapping.ts |
| 3263 | D3 | (Bengali only) | manual | 03,04 | - |
| 3264 | D3 | WebDriver check | some-match | 03,04 | scripts/verify/step12-adyen.ts |
| 3265 | D3 | known bot UA block | match | 03,04 | lib/cms/defaults/legal.ts |
| 3266 | D3 | IP sudden country change | match | 03,04 | lib/compliance/rules.ts |
| 3267 | D3 | pattern-based | some-match | 03,04 | scripts/verify/step12-nmi.ts |
