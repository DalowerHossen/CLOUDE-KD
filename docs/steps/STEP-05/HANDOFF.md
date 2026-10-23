# STEP 05 handoff - Encryption, File Storage, E-mail and Notifications

Branch: claude/clever-goldberg-8ncdae (contains STEP 01 to 05).

## FEATURE_LIST items implemented (line ranges of SCOPE.md)

- Part 9 3771-3799 (encryption and secrets): AES-256-GCM, per-purpose and per-company data keys, key versions, rotation tool, blind index, redaction helpers, secret access log.
- Part 9 3892-3906 and Part 11 4482-4512 (upload protection): magic bytes, extension and type cross-check, size limits, SVG, EXIF, PDF, Office, zip checks, polyglot, names, duplicate check, quarantine, scanner hook, chunked upload, integrity hash, rate limit, quota, 30 second limit.
- Part 9 4078-4139 (storage abstraction, media): Supabase and Google Drive adapters, signed links, fallback, migration, quota view, dedupe, retention and trash, metadata stripping, export watermark. Not built: image variants and AVIF/WebP conversion, PDF font subsetting and downsampling, ZIP bulk export, cost calculator, file versioning per document, archive tier (see DECISIONS D18, D19).
- Part 2 555-620 (e-mail): platform and tenant providers, presets, test, fallback chain, quotas, bounce, complaint, suppression, plain-text part, list-unsubscribe, tracking, delivery status, SPF/DKIM/DMARC check. Part 2 836-869 (notifications): bell, list, read state, categories, filters, preferences, mutes, throttle, digest, event consumers. Part 7 2957-2965 (template manager) and Part 5 2156-2166 (delivery tracking): done except re-send button and copy-link button (owner screens of the invoice STEP).
- REQ-STORAGE items 1 to 6; REQ-ADMIN-CONNECT item 3 (purpose `processor-credentials`).

## Migrations

| File                       | Content                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S05_001_encryption         | `secret_access_log` (append-only), `key_rotation_runs`                                                                                                                                                                               |
| S05_002_files              | `files`, `file_quarantine`, `malware_hashes`, `upload_sessions`, `upload_chunks`, `upload_usage`; `kd_upload_*`, `kd_company_storage_bytes`, `kd_known_malware`                                                                      |
| S05_003_storage_adapters   | `drive_connections`, `file_access_log` (append-only), `signed_url_grants`, `files.purged_at`; `kd_grant_redeem`, `kd_grant_purge`                                                                                                    |
| S05_004_storage_fallback   | `drive_connections.last_fallback_notified_at`; `kd_drive_claim_fallback_notice`                                                                                                                                                      |
| S05_005_storage_migrations | `storage_migrations`, `storage_migration_items`; `kd_migration_enqueue_all/claim/item_result`                                                                                                                                        |
| S05_006_email              | `email_settings`, `email_outbox`, `email_suppressions`, `email_events` (append-only); `kd_email_enqueue/claim/result/event/track/unsubscribe/sent_count/setting_count/purge`                                                         |
| S05_007_email_templates    | `email_template_overrides`; `kd_template_save/reset/restore`                                                                                                                                                                         |
| S05_008_notifications      | `notifications` (own rows readable by the browser, in the Realtime publication), `notification_preferences`, `notification_mutes`, `notification_settings`; `kd_notify_insert`, `kd_notification_mark_read`, `kd_notification_purge` |

All tables have RLS enabled with default deny. Every `down` file is provided.

## Contracts provided

`encryption` (`services/encryption`), `storage` (`services/storage/storage-service.ts`: `put`, `get`, `signedUrl`, `remove`, `resolveProvider`, `migrate`), `email` (`services/email/email-service.ts`: `send`, `enqueue`, `registerTemplate`), `notification` (`services/notification`). Extra in-process helpers: `blindIndex` (encryption service), `createSignedUrl` options, `registerBrandResolver`, `notifyExtended` (dedupe key, recipient override), `setScanner`, `registerOtpRecipientResolver` is STEP 04.

## Config and environment

`config/storage.ts`, `config/email.ts`, `config/notifications.ts`, `config/permissions/s05-storage-email.ts` (`storage.manage`, `storage.migrate`, `storage.admin`, `kyc.file.read`, `email.settings.manage`, `email.platform.manage`, `email.template.manage`), `config/nav/s05.ts`. Environment (`lib/env/s05.ts`, `config/env/s05.env.fragment`): `ENCRYPTION_KEY_V2`, `ENCRYPTION_KEY_V3`, `ENCRYPTION_ACTIVE_KEY_VERSION`, `MALWARE_SCANNER_URL`, `MALWARE_SCANNER_TOKEN`. Existing: `ENCRYPTION_KEY` (version 1, never rotate), `SMTP_*` (last fallback provider), `GOOGLE_OAUTH_CLIENT_ID/SECRET`.

Cron jobs: `upload-session-purge` (hourly), `file-retention` (daily), `storage-health` (15 minutes), `storage-migrate` (every minute), `email-queue` (every minute), `email-purge`, `notification-digest` (06:05 UTC), `notification-purge`.

## Pages and APIs

Pages: `/settings/storage`, `/settings/email`, `/settings/email/templates`, `/notifications`, `/admin/storage`, `/admin/emails`, `/admin/emails/settings`. APIs: `/api/storage/{uploads, uploads/[id], uploads/[id]/chunks/[index], uploads/[id]/complete, files/[id], files/[id]/restore, files/[id]/signed-url, download/[token], quota, drive, drive/connect, drive/callback, drive/disconnect, migrations}`, `/api/email/{settings, settings/actions, templates, templates/actions, track/open/[token], track/click/[token]/[index], unsubscribe/[token], webhooks/[provider]}`, `/api/notifications`, `/api/admin/{storage, emails/settings, emails/templates}` (+ `/actions`).

## Owner steps - Google Cloud (Drive link, REQ-STORAGE item 2)

1. In the Google Cloud project of the sign-in client: enable the Google Drive API.
2. OAuth consent screen: add the scope `https://www.googleapis.com/auth/drive.file` (non-sensitive, no verification needed for this scope).
3. On the OAuth client add the authorized redirect URI `<NEXT_PUBLIC_APP_URL>/api/storage/drive/callback`.
4. No new environment variable: the same `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are used.

## E-mail template ids registered

`auth.account-locked`, `auth.verify-email`, `auth.reset-password`, `auth.unlock-confirmation`, `auth.new-device`, `auth.password-changed` (STEP 03); `security.token-otp`, `security.alert` (STEP 04); `system.test`, `notification.generic`, `digest.daily` (STEP 05).

## Requirements for other STEPs

- Store every file through `getService('storage').put(...)` (documents, logos, KYC, exports); never write to Supabase Storage or Drive directly. Read with `get` or `signedUrl`. Use the category `kyc` for identity documents (own key purpose, permission `kyc.file.read`).
- Send e-mail with `getService('email').send(...)` and add your catalogue to `emails/catalog.ts`. Templates starting with `auth.`, `security.`, `kyc.` and `payment.` carry no tracking; `digest.`, `marketing.`, `notification.`, `report.` carry the unsubscribe header.
- Emit domain events with `number`, `clientName`, `amount`, `href` in the payload for good notifications (D40). Plans should define the entitlements `storage.quota_mb`, `storage.monthly_upload_mb`, `email.daily_limit`.
- Encrypted columns: store the `EncryptedPayload` as `jsonb` with the same scope you used to encrypt; call `rotateBatch` (services/encryption/rotation.ts) per column when a new key version is activated.

## Files outside STEP 05 ownership that were changed

| File                                                                                                                                                                                                                                         | Change                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `config/security.ts` (STEP 04)                                                                                                                                                                                                               | rate policies `upload`, `download`                                           |
| `lib/middleware/csrf.ts`, `lib/middleware/bot-detector.ts` (STEP 04)                                                                                                                                                                         | e-mail webhook, unsubscribe and tracking paths in the server-to-server lists |
| `scripts/verify/step04-static.mjs` (STEP 04)                                                                                                                                                                                                 | allows STEP 05 plain handlers                                                |
| `config/ownership.json`                                                                                                                                                                                                                      | STEP 05 patterns (see DEPENDENCY_REQUESTS)                                   |
| generated barrels (`config/nav-map.ts`, `config/permissions.ts`, `cron/schedule.generated.ts`, `lib/bootstrap.generated.ts`, `lib/env/schema.generated.ts`, `lib/i18n/strings/en.ts`, `services/jobs/handlers.generated.ts`, `.env.example`) | regenerated by `npm run gen`                                                 |

## Known issues

- Nothing was run against a live Supabase project, Google Drive or a mail provider (VERIFY.md section B). The request shapes of Resend, SendGrid, Mailgun, Postmark and the feedback formats come from the providers' public documentation as known to the build and were not re-read live (D28); the "send test" button proves each. The Google Drive REST calls were checked against a local fake only.
- Amazon SES is sent through SMTP; its bounce feedback (SNS) is not read. Mailgun, Postmark, Resend and SendGrid feedback is read.
- The malware scanner is a synchronous HTTPS gateway (D11); native clamd sockets are not used. Without `MALWARE_SCANNER_URL` files are not scanned (status `skipped`).
- Office files with macros are refused rather than cleaned; PDF links and forms are dropped by the rebuild (D5, D6).
- `companies.storage_provider` (STEP 02) is informational; the provider is resolved at run time and recorded per file.
- Platform staff have no bell or notification page yet (DEPENDENCY_REQUESTS 5).
- Disconnecting Google Drive while files are in Drive makes them unreadable until relinked unless they were moved first (the page warns).

## What the Integrator must run

1. Merge this branch (merge commit), then `npm run gen` and commit the result.
2. `bash scripts/db-apply.sh --clean`, `bash scripts/run-assertions.sh all`, `bash scripts/integration-check.sh`.
3. Apply DEPENDENCY_REQUESTS.md items 1 to 7; set the Google redirect URI; run VERIFY.md section B.
4. Tag `step-05-merged`.
