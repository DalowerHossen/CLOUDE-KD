# STEP 05 verification record

Date: 2026-10-16. Branch: claude/clever-goldberg-8ncdae. PostgreSQL 16 (plain, with `supabase/local-shim.sql`).

## A. Automated checks (run in this session)

| Command                                                                                                                                                                           | Result                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `PGHOST=/tmp/pgsock bash scripts/integration-check.sh` (generators, lint, typecheck, guards, migrations from zero twice, assertions, production build, client bundle secret scan) | ok                                                                        |
| `bash scripts/db-apply.sh --clean`                                                                                                                                                | S01 to S05 migrations applied and re-applied cleanly (S05_001 to S05_008) |
| `sql/assertions/s05_001` to `s05_008`                                                                                                                                             | ok                                                                        |
| `npx tsx scripts/verify/step05-core.ts`                                                                                                                                           | 16 checks ok                                                              |
| `npx tsx scripts/verify/step05-files.ts`                                                                                                                                          | 11 checks ok (sample malicious and valid files)                           |
| `node scripts/verify/step04-static.mjs`                                                                                                                                           | ok                                                                        |
| `bash scripts/check-all.sh`                                                                                                                                                       | ok                                                                        |

Database assertions prove: secret access log append-only and constrained; one live file record per company, category and content; chunk upload rules (one assembler, size and index checks); monthly usage limit per company; known-malware list; signed grant expiry, use limit and deleted-file handling; append-only file access log; one Drive link per company; one fallback notice per hour; migration jobs (enqueue only files on the other provider, batch claiming, retry then fail, closing, one running move per company, paused moves hand out nothing); outbox idempotency key, one-minute duplicate guard, suppression per company, claim and retry, deferral keeps the attempt count, delivery status only moves forward and bounces win, hard bounce suppresses, tracking token, unsubscribe, setting slots; template versions (one active, archive, reset, restore, isolation); notifications (dedupe, throttle, internal paths only, mark-read own rows only, purge, own-row policy and column grants). Every `kd_*` function is closed to `authenticated`; every table has RLS.

`step05-core.ts` proves: encryption round trip, fresh IV, key versions (old versions stay readable), tamper, wrong purpose, wrong scope, wrong key all fail, 2 MB payload, blind index, redaction; malware scanner adapter (clean, infected, error, bad token, unreachable); object path, backoff, range header, PDF watermark; Supabase adapter against a fake client; Google Drive adapter against a local fake Drive (folder creation and reuse, binary-safe multipart upload and download, rate-limit retry, 404 on delete, revoked link marking); HTTP mail adapters (request shapes, error mapping); SMTP error mapping; mail content (text part, tracking rewrite without exposing the real address, link allow list, phishing signals); provider feedback signatures for Resend, Mailgun, Postmark and SendGrid (good, tampered, stale, wrong key); SPF, DKIM, DMARC evaluation and score; template body cleaning, escaping and brand shell; notification rules; every catalogue template renders.

`step05-files.ts` proves refusal of: an executable renamed to png, ELF and script files, extension and content-type mismatches, empty and unknown files, SVG with scripts (rasterized to PNG) and with entities, zip bombs, lying zip sizes, zip slip, too many entries, Office files with macros, embedded objects and remote templates, legacy OLE files, polyglots (image plus PHP, image plus zip, trailing data, script in a comment, script in CSV), oversize files per type and category, wrong type per category (KYC, logo), hidden dangerous extensions and path traversal in names, and a decompression-bomb image. It also proves: EXIF removal and re-encoding, PDF scripts, open action and attachments removed, name sanitizing.

Production build: all pages and API routes compile (`/settings/storage`, `/settings/email`, `/settings/email/templates`, `/notifications`, `/admin/storage`, `/admin/emails`, `/admin/emails/settings`).

## B. Manual script (needs a Supabase project, a Google Cloud OAuth client, a mail provider and the merged STEPs 02 to 04)

Not run here: no Supabase project, no Google credentials, no mail provider. Record the result next to each line.

1. Upload a PNG and a PDF through the upload session API (create, chunks, complete): the file record shows `storage_provider` supabase; read it back through a signed link; the bytes match. In Supabase Storage the object is unreadable (ciphertext).
2. Upload an executable renamed `.png`: refused, a quarantine row and a security event appear; `/admin/storage` lists it.
3. `/settings/storage` as owner: link Google Drive (consent screen shows only "see, edit, create files created with this app"); folder `tenants/<company>/<category>` appears in Drive; new files go to Drive and their content in Drive is unreadable.
4. Disable the network to Google (or revoke the app in the Google account): the next upload goes to Supabase, an audit entry `storage.fallback` exists and the owner gets one notification; relink and run a move of all files to Drive, then back; hashes match; `storage_provider` switches per file.
5. `/admin/emails/settings` as super admin: add SMTP (preset) and "Send test message" to your address; add Resend or SendGrid as slot 2 and stop the SMTP server: the message still arrives through slot 2.
6. Send the same message twice within a minute: only one arrives. Use a bounce address: after a hard bounce the address is on the suppression list.
7. Domain check on your sending domain shows SPF, DKIM and DMARC findings and a score.
8. Edit a template in `/admin/emails`, preview on computer and phone widths, send a test, reset to the built-in design, restore an older version.
9. Trigger an event (for example `invoice.paid` from STEP 07 later): a notification appears on `/notifications` without reloading the page; switch the topic off or pause it and see it stop.
