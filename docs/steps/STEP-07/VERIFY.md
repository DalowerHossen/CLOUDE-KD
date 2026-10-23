# STEP 07 verification record

Date: 2026-10-16. Branch: claude/clever-goldberg-8ncdae. PostgreSQL 16 (plain, with `supabase/local-shim.sql`).

## A. Automated checks (run in this session)

| Command                                                      | Result                                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `PGHOST=/tmp/pgsock bash scripts/integration-check.sh`       | ok (section "Integration run" below)                                                          |
| `bash scripts/db-apply.sh --clean`                           | S01 to S07 migrations applied and re-applied cleanly (S07_001 to S07_010)                    |
| `sql/assertions/s07_001` to `s07_010`                        | ok                                                                                           |
| `npx tsx scripts/verify/step07-core.ts`                      | 17 checks ok                                                                                 |
| `node scripts/verify/step04-static.mjs`                      | ok (every API route is wrapped or on the plain-handler list)                                 |
| `bash scripts/check-all.sh`                                  | ok                                                                                           |
| `node scripts/check-ownership.mjs 07 HEAD <base>`            | only generated barrels and the three shared-file lines named in DEPENDENCY_REQUESTS remain   |

Database assertions prove: settings (one row per company and section, version conflict on a stale save, milestones once); invitations (single use, expiry, accept creates profile and membership together, a used or expired token is refused); KYC (one open submission per company, four document types, duplicate content flag, append-only view log, review columns); domains (five per company, one primary, only a verified domain can be primary); data requests (one open closure per company, claim function); admin actions (known actions only, reason required, one open action per subject) and notes; shifts (valid minutes, overlap refused, a refused replace keeps the earlier plan), announcements (end after start, known kinds), setup steps (one row per step); tickets (unique numbers, known values, internal notes only by agents, writes closed to clients); feedback (score range, one prompt state per person). Every table has RLS with default deny and is closed to `authenticated` except the two ticket tables which allow only a company's own select.

`step07-core.ts` proves: section schemas, presets and wizard input; forms against schemas and strings; team presets and the staff grant rule; security and approval sections; KYC rules, review input and the screening hook; hostnames, DNS records and public-address-only answers; policy and backup sections and the export registry refusing secret columns; admin people input; admin operations input (staff, shifts, announcements, flags, setup) and the on-duty rule; support input, SLA clocks and permission defaults; feedback input, the NPS prompt rules and score; single sign-on settings.

## B. Manual script (needs a Supabase project and the merged STEPs 02 to 05)

Not run here: no Supabase project. Record the result next to each line.

1. Sign up, finish the wizard, skip it, resume it from the checklist. Upload a logo; it appears on the branding screen only.
2. Invite staff; open the link in a private window; accept; sign in. Change the permissions; confirm the staff member sees only what was granted. Cancel and resend an invitation.
3. Upload the four KYC documents; submit; as a reviewer start the review, open a document (an access log row must appear), recommend approval; as the CEO approve in the approvals list; within 15 minutes the owner sees "approved".
4. Add a custom domain; create the two DNS records; run the check.
5. Request a data export; download it with a fresh step-up; request closure and cancel it.
6. As the super admin: complete `/admin/setup`; create an admin staff member and open the link from the e-mail; plan a shift; publish an announcement and see it at `/announcements`; change a feature flag.
7. As the CEO suspend a company: the request waits in the approvals list; after approval (cron within 5 minutes) its users can no longer use the API.
8. Open a support ticket as an owner; as a support agent on duty answer it; close and rate it.
9. After 14 days of company age answer the satisfaction question; see it in `/admin/feedback`.

## Integration run

`PGHOST=/tmp/pgsock bash scripts/integration-check.sh`: generators current, lint, typecheck, guards, migrations from zero with all assertions, production build and client bundle secret scan all passed (`integration-check: ok`).

The production build found one real defect that the logic checks had missed: the export registry refused the column `plan_key` because its name contains `key`. The rule now refuses only key-like secrets (`api_key`, `private_key`, ...), and `step07-core.ts` now loads the STEP 07 table registrations so the same mistake fails there first.
