<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-20.md -->
# Manual reading, part 20 (features 1882 to 1980, the lines that are Bengali only)

Read against the code and the STEP 07 and 13 notes on 2026-10-27; nothing was opened in a browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 1883 | Approval audit log | present | `/api/approvals`, the audit trail |
| 1887 | Signature image upload | present | the e-sign methods are typed, drawn and uploaded (`services/esign/finalize.ts`) |
| 1893 | Bulk progress bar, real time | check in browser | `app/(dashboard)/invoices/batches` |
| 1894 | Per-e-mail success or failure result | present | batch items carry their own status |
| 1897 | Duplicate-send guard | present | STEP 09: one batch item per invoice and action (unique index) |
| 1898 | Bulk history log | present | `/api/invoices/batches` |
| 1899 | E-mail open tracking, per e-mail | present | `/api/email/track/open/[token]` |
| 1905 | Server-side permission check | present | `permission` on every route through `withApi` |
| 1906 | Approval request notification to the owner | present | the approval service notifies approvers |
| 1907 | Approval request history | present | `/api/approvals` |
| 1923 | Company ownership transfer | not found | see feature 553 |
| 1927 | In-app "What's new" widget | present | built in 16.26 (`/whats-new`, banner) |
| 1939 | Saved view per user and list | present | `/api/clients/views` and the report presets |

## Not found: 1923.
