<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-41.md -->
# Manual reading, part 41 (features 3961 to 4029, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. Line 3978 is only a row of underscores in the list.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 3964 | Log of every file upload and download | present | every download is audited (STEP 07 D17, `app/api/storage/download/[token]/route.ts`) |
| 3968 | Log of every sign-in and sign-out | present | table `auth_login_events` |
| 3969 | Log of every two-step action | present | `auth_login_events` and the audit trail |
| 3970 | Log of every approval and rejection | present | `/api/approvals`, the audit trail |
| 3971 | Log of every data deletion | present | `kd_user_purge` leaves a tombstone and a certificate (16.21); the audit trail |
| 3972 | Log of every impersonation | present | `/api/admin/impersonation` lists them |
| 3973 | Session duration tracking | partial | `user_sessions` keeps start and last activity; no duration report |

## Partly built: 3973.
