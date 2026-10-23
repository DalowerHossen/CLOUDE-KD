# STEP 04 handoff - Security Shield, Fraud Signals and Security Operations

Branch: claude/clever-goldberg-8ncdae (contains STEP 01, 02, 03 and 04).

## FEATURE_LIST items implemented (docs/source/FEATURE_LIST.md line ranges of SCOPE.md)

- Part 9 3800-3891 (application security, bots and abuse): headers, CSP with nonce, CSRF, SSRF guard, redirect validation, sanitizer, rate limits, IP bans, bot and headless checks, request size limit, Turnstile verification.
- Part 9 3907-3918 (tokens and links): signed 128-bit tokens, hashed storage, expiry, revoke, reissue, e-mail one-time code, masking, enumeration and leak guards.
- Part 9 3971-3981 (webhooks): signature, timestamp window, replay cache helpers (processor formats belong to STEPs 10 to 12).
- Part 9 4240-4262 (observability and incidents): health endpoints, Sentry scrubbing, alerts, incidents, metrics, runbooks.
- Part 11 4542-4580 (fraud engine), 4513-4540 (SIEM), 4651-4728 (monitoring and alerting, VPN/proxy), 4729-4777 (input security), 4805-4853 (tracking without keystrokes on payment pages), 4854-4882 (zero trust, zero tolerance).
- REQ-NETWORK (block on signup, payment, KYC, admin; flag plus second factor on login); REQ-CARD item 1 (no tracking on payment pages).

## Migrations

| File                       | Content                                                                                                                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S04_001_rate_limits_events | `rate_limits`, `ip_blocks`, `security_events` (append-only); `kd_rate_limit_hit/purge`, `kd_ip_block/unblock/is_blocked`, `kd_security_event`, `kd_idempotency_begin/complete/release`                                                    |
| S04_002_network_intel      | `ip_reputation` (cache, Tor list, whitelist); `kd_network_whitelisted`, `kd_reputation_get/put/purge`, `kd_tor_replace`, `kd_whitelist_add`                                                                                               |
| S04_003_signals            | `device_fingerprints`, `fraud_signals` (append-only), `risk_scores` (10 percent daily decay); `kd_risk_add/get/clear`, `kd_device_seen`, `kd_users_for_ip`, `kd_signups_for_ip`, `kd_last_country`, `kd_actor_actions`, `kd_signal_count` |
| S04_004_tokens             | `access_tokens`, `token_events` (append-only); `kd_token_event/touch/otp_set/otp_check/revoke`                                                                                                                                            |
| S04_005_siem               | `siem_destinations`, `siem_iocs`, `siem_findings`; `kd_severity_rank`, `kd_siem_fetch/delivery_result/correlate/ioc_hits/open_finding`                                                                                                    |
| S04_006_alerting_incidents | `alerts`, `alert_silences`, `alert_channels`, `oncall_roster`, `incidents`, `incident_events` (append-only); `kd_alert_raise/ack/resolve/escalate`, `kd_incident_transition/metrics`                                                      |

All tables have RLS enabled with default deny; access is through the service role in server code. Every `down` file is provided.

## Contracts provided

- `security` (`services/security/security-service.ts`): `rateLimit`, `checkNetwork`, `verifyTurnstile`, `riskScore`, `raiseSecurityEvent`, `sanitize`.
- `tokens` (`services/security/token-service.ts`): issue, verify, revoke, reissue, send and verify one-time code; `registerOtpRecipientResolver` for document types other than `invoice` and `hub`.
- `idempotency` (`services/security/idempotency-service.ts`).
- Event hooks inside the process: `onSecurityEvent` (`services/security/events.ts`), `onSiemFinding` (`services/siem/siem-service.ts`).

## Config

- `config/security.ts`: body limit, CORS, CSP profiles, redirect prefixes, SSRF settings, CSRF names, network policy by context, `RATE_POLICIES`, ban settings, country block, geo-fence, fail-closed contexts, signal weights and thresholds, fingerprint exclusions.
- `config/middleware/s04.ts` (proxy chain), `config/permissions/s04-security.ts` (`security`, `fraud`, `siem`, `incident`, `alert` read and manage), `config/nav/s04.ts` (Security, Fraud, SIEM, Incidents, Alerts, System health), `config/boot/s04-*.ts` (fraud reaction, alert wiring, Sentry, e-mail templates).
- Cron jobs: `s04-rate-limit-purge`, `s04-tor-list` (every 6 hours), `s04-siem` (every 5 minutes: correlate then forward), `s04-alert-escalation` (every 5 minutes).

## Environment variables

No new variables. Used from STEP 01: `HMAC_TOKEN_SECRET` (tokens and address hashing), `NETWORK_INTEL_PROVIDER`, `NETWORK_INTEL_API_KEY`, `TURNSTILE_SECRET_KEY`, `SENTRY_DSN`.

## E-mail templates (`emails/security/`, catalogue `emails/security/index.ts`)

`security.token-otp` (variable `code`), `security.alert` (variables `severity`, `title`, `body`). The e-mail service of STEP 05 renders them; `config/boot/s04-email-templates.ts` registers the definitions when the service exists.

## Pages and APIs

- Pages (platform staff): `/admin/security`, `/admin/fraud`, `/admin/siem`, `/admin/incidents`, `/admin/alerts`, `/admin/health`.
- Admin APIs: `/api/admin/security` (+ `whitelist`, `blocks`, `fraud`, `fraud/actions`), `/api/admin/siem` (+ `actions`), `/api/admin/alerts` (+ `actions`), `/api/admin/incidents` (+ `actions`). Write actions need a fresh step-up (password plus code within 5 minutes).
- Public: `/api/health` (liveness), `/api/health/ready` (database), `/api/security/device` (browser fingerprint hash of a signed-in user).
- Runbooks: `docs/RUNBOOKS/security-*.md` (five).

## Requirements for other STEPs

- STEP 05 (encryption, e-mail): `encryption.encrypt('pii', ...)` is used for SIEM destination and alert channel keys; without it these keys cannot be saved. Register `emails/security` templates.
- STEP 06 and later (document links): call `getService('tokens').issue(...)` for every shared link; register an OTP recipient resolver for each new document type.
- STEP 10 to 12 (webhooks): verify the signature with `lib/webhook` (constant-time compare, 300 second window) before parsing; keep `webhook_events` unique on the provider event id; payment pages use the strict `payment` CSP profile (`/pay/*`, `/portal/pay*`).
- All STEPs: raise zero-tolerance events with `getService('security').raiseSecurityEvent(...)`; new public mutating routes get CSRF protection from the proxy automatically; new `/api` routes use `withApi`.

## Files outside STEP 04 ownership that were changed

| File                                                                                                                                                                                                                 | Change                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/layout.tsx` (STEP 01)                                                                                                                                                                                           | mounts `CsrfInit`                                                                                                                                           |
| `app/(dashboard)/layout.tsx` (STEP 01)                                                                                                                                                                               | mounts `DeviceCollector`                                                                                                                                    |
| `services/audit/request-meta.ts` (STEP 02)                                                                                                                                                                           | exports `hashIp`                                                                                                                                            |
| `services/auth/actor.ts`, `login-flow.ts`, `session-ops.ts`, `signup-flow.ts` (STEP 03)                                                                                                                              | insider-activity check once a minute; CSRF cookie rotation at sign-in and sign-out; refusal of the fifth sign-up from one address in a day (neutral answer) |
| `config/ownership.json`                                                                                                                                                                                              | STEP 04 patterns for `lib/middleware/shield.ts`, `app/api/security/**`, `emails/security/**`                                                                |
| generated barrels (`config/nav-map.ts`, `config/permissions.ts`, `cron/schedule.generated.ts`, `lib/boot.generated.ts`, `lib/bootstrap.generated.ts`, `lib/i18n/strings/en.ts`, `lib/middleware/chain.generated.ts`) | regenerated by `npm run gen`                                                                                                                                |

`node scripts/check-ownership.mjs 04 HEAD <base>` lists exactly these files.

## Known issues

- Nothing in this STEP has run against a live Supabase project or a real network intelligence key (see VERIFY.md section B). Provider response formats were taken from the providers' documentation summaries; the request URLs of IPQualityScore and MaxMind and the vendor header conventions of the SIEM and alert channels were not re-read from the vendor pages (DECISIONS D5, D13, D17).
- Without a network intelligence provider only the Tor exit list and address blocks are checked; VPN traffic cannot be detected (D6).
- SIEM: CloudWatch, Sentinel and Chronicle receive a JSON batch through an HTTPS gateway the owner provides; native signing (SigV4, shared key, OAuth) and the Chronicle UDM schema are not implemented (D13). Plain UDP/TCP syslog is not available on the serverless host; syslog, CEF and LEEF are sent as text over HTTPS.
- Alert SMS needs an HTTPS gateway of the owner's (D17).
- The rate limiter uses the database; the adapter interface (`setRateLimitAdapter`) is ready for an Upstash adapter, which is not written.
- CSRF protection is the signed double-submit cookie plus the Origin check; per-form one-time tokens are not added (D3).
- The payment-page CSP and the Trusted Types policy: Trusted Types runs in report-only mode (D1).
- Browser and edge Sentry reporting need the Integrator files named in DEPENDENCY_REQUESTS.md.
- Token revoke and reissue have no admin screen in this STEP; they are service operations (the document screens belong to the invoice and portal STEPs).

## What the Integrator must run

1. Merge this branch (merge commit), then `npm run gen` and commit the result.
2. `bash scripts/db-apply.sh --clean`, `bash scripts/run-assertions.sh all`, `bash scripts/integration-check.sh`.
3. Apply DEPENDENCY_REQUESTS.md items 1 to 4.
4. Register the `emails/security` templates in STEP 05, then run VERIFY.md section B.
5. Tag `step-04-merged`.
