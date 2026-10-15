# STEP 05 - Encryption, File Storage and Email

Wave B. Depends on: STEP 01. Contract use: tenant, audit, events, jobs, security. Provides contracts: encryption, storage, email, notification.

## Feature sources
- Part 9 lines 3771-3799 (B encryption and secrets), 3892-3906 (E upload protection), 4078-4139 (N storage abstraction, O media optimization)
- Part 11 lines 4482-4512 (B file upload security deep)
- Part 2 lines 555-620 (B email: platform SMTP, tenant SMTP, deliverability), 836-869 (H notifications), 947-953 (L backup, storage parts)
- Part 7 lines 2957-2965 (C3 email template manager)
- Part 5 lines 2156-2166 (C4 email delivery tracking)
- MASTER_PROMPT: security layers 4 and 7, file duplicate detection
- REQUIREMENTS_SPEC: REQ-STORAGE, REQ-ADMIN-CONNECT item 3 (encryption purpose `processor-credentials`)

## Owned paths and migrations
OWNERSHIP_MAP.md rows 05 and section 4. Migration block `S05_*`.

## Sub-steps
- 05.1 Encryption library: AES-256-GCM, HKDF-derived per-purpose and per-company data keys from the environment master key (purposes: files, processor-credentials, oauth-tokens, kyc, pii), key-version tags, rotation tooling for secondary keys, blind index for searchable encrypted fields, PII redaction helpers, secret access audit. Keys only from environment.
- 05.2 File validation pipeline: magic bytes, extension and MIME cross-check, size limits (image 5 MB, PDF 10 MB, KYC 5 MB), SVG sanitize or rasterize, EXIF strip and re-encode, PDF script and embedded-file removal, Office macro removal, zip bomb and zip slip checks, polyglot detection, name sanitization, content-hash duplicate check, quarantine table, pluggable malware scanner hook (ClamAV adapter), chunked and resumable upload, integrity hash check, upload rate limits and quotas.
- 05.3 Storage adapters: `supabase.ts` (encrypted objects in a private bucket per company path) and `google-drive.ts` (per-company OAuth, minimal scope, folder `/tenants/{company_id}/{category}/`, encrypted bytes only), `base.ts`, upload and download with signed short-lived URLs (1 hour), access audit, download rate limits, watermarking for exports, retention policy.
- 05.4 Provider resolver (REQ-STORAGE): `resolveProvider(companyId)`, runtime choice, health checks, automatic fallback to the other provider with audit entry and notification, `storage_provider` on every file record.
- 05.5 Drive link flow: connect and disconnect APIs and the settings page `(dashboard)/settings/storage` (link status, quota, provider in use, migration entry point), OAuth tokens encrypted, revoke handling.
- 05.6 Migration tool: move files between providers (single, batch, all), resumable, hash verified, atomic switch of `storage_provider`, optional source delete after verification, progress UI for owner and admin `(admin)/admin/storage`, audit entries.
- 05.7 Email core: adapter interface and adapters (generic SMTP, Resend, SendGrid, SES, Mailgun, Postmark), platform SMTP config by super admin, tenant SMTP override page `(dashboard)/settings/email`, connection test and test email, queue with retry, one-minute duplicate guard, suppression list, bounce and complaint intake, email-only open and click tracking (never in PDFs or payment pages), SPF/DKIM/DMARC check tool.
- 05.8 Template system: React Email base layout and brand variables, template registry (`registerTemplate`), preview, admin template manager `(admin)/admin/emails` with test send, tenant overrides, variable validation.
- 05.9 Notifications: in-app notification service, preference model, bell and list UI, realtime push, consumers of domain events (invoice, payment, dispute, kyc, auth events), WhatsApp and push hooks left to STEP 16 through the notification contract.
- 05.10 Assertions and checks: `sql/assertions/s05_*.sql` (file records always have provider and key version), `scripts/verify/step05-*.sh` (sample malicious files: executable renamed png, svg script, zip bomb, polyglot).

## Security notes
No plaintext file bytes reach any provider. The master key never reaches the database. Signed URLs are tenant-scoped. KYC category files have separate access permission.

## Verification
Encrypt then decrypt round trip; tampered ciphertext fails; company without Drive stores in Supabase; company with Drive stores in Drive; Drive disconnected mid-upload falls back and logs it; migration moves a file and the hash matches; sample malicious files are rejected; test email passes SPF/DKIM check tool output; duplicate email within one minute is suppressed.

## Handoff must list
Contracts implemented, env keys, Google Cloud OAuth setup steps for the owner, email template ids registered.
