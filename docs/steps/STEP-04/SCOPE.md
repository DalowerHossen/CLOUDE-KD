# STEP 04 - Security Shield, Fraud Signals and Security Operations

Wave B. Depends on: STEP 01. Contract use: tenant, audit, events, jobs, auth. Provides contracts: security, tokens. Owns `middleware.ts`.

## Feature sources
- Part 9 lines 3800-3891 (C application security, D bots and abuse), 3907-3918 (F token and link security), 3971-3981 (I webhook security), 4240-4262 (S observability and incidents)
- Part 11 lines 4542-4580 (D fraud security deepening: engine core), 4513-4540 (C2 SIEM part), 4651-4728 (G monitoring and alerting, H VPN/Proxy), 4729-4777 (I input security), 4805-4853 (K tracking), 4854-4882 (L zero trust, zero tolerance)
- MASTER_PROMPT: security layers 1, 2, 6, 8, 9, 10; SIEM; monitoring, alerting and incident response; user tracking and anti-fraud
- REQUIREMENTS_SPEC: REQ-NETWORK; REQ-CARD item 1 (no tracking on payment pages)

## Owned paths and migrations
OWNERSHIP_MAP.md rows 04 and section 4. Migration block `S04_*`. Config file `config/security.ts`.

## Sub-steps
- 04.1 Headers and policies: nonce-based CSP (no unsafe-inline), Trusted Types, HSTS, frame-ancestors none, referrer policy, permissions policy, CORS allowlist, open-redirect validation, SSRF guard (allowlist, private ranges blocked), HTTP header injection strip, request size limit (10 MB). A stricter payment-page CSP profile that allows only the processor's script and frame origins and no analytics.
- 04.2 Sanitizer: `lib/security/sanitizer.ts` (Unicode NFC, zero-width and RTL override removal, null byte rejection, path traversal, prototype pollution guard), DOMPurify wrapper, Zod strict helpers, safe-regex validation script.
- 04.3 Middleware composition: `middleware.ts` and `lib/middleware/chain.generated.ts` consumer, CSRF (double-submit cookie, one-time form tokens), Turnstile verification, honeypot, bot and headless detection, user-agent validation.
- 04.4 Rate limiting: Supabase table-based limiter behind an adapter interface (Upstash adapter ready), per IP, per user, per endpoint policies in config, brute-force IP bans, large-payload guard, generic idempotency middleware (`lib/middleware/idempotency.ts`).
- 04.5 Network intelligence (REQ-NETWORK): provider adapters (IPQualityScore, MaxMind Anonymous IP), Tor exit list refresh job, datacenter ranges, residential proxy score, geo-fencing, country block, IP reputation, whitelist, `checkNetwork(ip, context)` with the policy table (block on signup, payment, kyc, admin; flag plus 2FA on login), admin configuration page `(admin)/security`.
- 04.6 Device and behaviour signals: device fingerprint collector (excluded on payment, auth-password and card pages), device trust, device reuse detection, impossible travel, velocity checks, trial abuse, same-IP multi-account, ATO and session hijack signals, insider-threat signals for admin_staff, activity tracking that never records key presses on payment pages.
- 04.7 Fraud and zero-trust engine: rule engine with risk scoring (`lib/security/fraud-engine.ts`, `risk-scoring.ts`, `zero-trust.ts`), user, device, network and transaction trust scores, adaptive step-up, zero-tolerance actions (ban, lock, freeze, session terminate, alert) through the contracts, admin console `(admin)/fraud`.
- 04.8 Tokens: `lib/auth/tokens.ts` HMAC-SHA256 signed 128-bit tokens, hashed storage in `access_tokens`, expiry by plan (7/30/90/365 days), revoke, reissue, optional email OTP gate (6 digits, 5 minutes), token masking in logs, enumeration and brute-force guard, leak detection events.
- 04.9 Webhook helpers: `lib/webhook/` signature verification helpers (HMAC compare in constant time, timestamp window), replay cache, duplicate detection helper used by STEP 10 and STEP 16.
- 04.10 SIEM: normalized event schema, forwarders (syslog, CEF, LEEF, Splunk HEC, Elastic, Datadog, CloudWatch, Azure Sentinel, Chronicle UDM), correlation rules, threat-intel IOC matching, admin page `(admin)/siem`.
- 04.11 Monitoring, alerting, incidents: health endpoints (`app/api/health`), Sentry config with PII scrubbing, alert rule engine, channels (email, Slack, Discord, webhook, PagerDuty, SMS), dedupe (5 minutes), escalation, silence windows, on-call roster, incident lifecycle (SEV1-SEV4), timeline, post-mortem template, metrics (MTTD, MTTR), runbooks in `docs/RUNBOOKS/security-*`.
- 04.12 Assertions and checks: `sql/assertions/s04_*.sql`, `scripts/verify/step04-*.sh` (header scan, CSP nonce presence, SSRF and redirect payloads, sanitizer vectors).

## Security notes
This STEP implements the enforcement that all other STEPs call. Fail closed when a provider is unreachable on payment, KYC, admin and signup contexts (block with a neutral message and raise an alert).

## Verification
Header scan matches policy; XSS, SQL injection, SSRF and open-redirect payload list is blocked and logged; Tor exit address blocked on signup and payment; same IP exceeding limits is limited; token with changed signature is rejected; webhook with stale timestamp rejected; zero-tolerance action fires on a seeded injection attempt.

## Handoff must list
Security policy table, config keys, middleware modules registered, env keys needed.
