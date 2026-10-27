<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-37.md -->
# Manual reading, part 37 (features 3565 to 3663, the lines that are Bengali only)

Read against the code, `docs/RUNBOOKS` and the CI files on 2026-10-27; nothing was opened in a browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 3572 | Network partition handling | partial | timeouts and retries in the payment, e-mail and webhook code; no general handling |
| 3573 | Disk full handling | not applicable | the app runs on a serverless host; tenant files are limited by the storage quota |
| 3591 | Post-mortem template | present | the incident screen (`app/(admin)/admin/incidents`) has a post-mortem step |
| 3592 | On-call roster structure | not found | |
| 3595 | Post-incident customer communication template | partial | incident updates feed the status page; no communication template |
| 3604 | Mobile 320 px screenshot check in CI | not found | |
| 3606 | Step-based smoke test in CI | not found | CI runs Lighthouse; the ZAP scan runs only on a schedule and only when `DAST_TARGET_URL` is set |
| 3630 | Admin staff activity log (who did what, when, on whose approval) | present | `app/(admin)/admin/audit`, `app/(admin)/admin/staff` |
| 3631 | Admin staff shift management (24/7 coverage) | partial | `services/team/admin-staff-duty.ts`; STEP 07: per-person time zones for shifts not built |
| 3637 | Approval reject with a reason, requester notified | present | `/api/approvals/platform/[id]/decision` |
| 3638 | Approval history, the full chain of every action | present | `/api/approvals/platform` |
| 3643 | Magic byte check for every file type | partial | validators for PDF and images (`lib/storage/validate`); other types were not seen |

## Not found: 3592, 3604, 3606. Partly built: 3572, 3595, 3631, 3643.
