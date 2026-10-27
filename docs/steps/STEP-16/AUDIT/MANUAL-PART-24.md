<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-24.md -->
# Manual reading, part 24 (features 2278 to 2376, the lines that are Bengali only)

Read against the code and the STEP 16 decisions on 2026-10-27; nothing was opened in a browser. Channels are e-mail and WhatsApp only: SMS, Telegram and Viber are not built (STEP 16 D12, their documentation could not be read).

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 2289 | Delivery report per channel | present | `/api/integrations/messaging/reports` |
| 2290 | Engagement report per channel | check in browser | |
| 2306 | Help category and tag | present | help articles have categories (`lib/cms/defaults/help.ts`) |
| 2311 | In-app help tooltip per feature | not found | see 2310 |
| 2313 | Support ticket create, client to owner | present | `/api/support/tickets` |
| 2320 | Internal ticket note, staff only | present | `internal` flag on a reply (`lib/helpdesk/rules.ts`) |
| 2322 | Ticket linked to the client profile | check in browser | |
| 2332 | Feedback converts to a ticket, automatic | check in browser | `/api/support/admin/feedback`, `services/support/opinion.ts` |
| 2333 | Feedback report (admin) | present | `app/(admin)/admin/feedback` |
| 2343 | Import preview (first 10 rows) | present | `/api/migration/jobs` validate step |
| 2348 | Import history log | present | `/api/import`, `/api/migration/jobs` |
| 2349 | Legacy invoice numbers kept | check in browser | |
| 2350 | Import duplicate detection | present | STEP 08 D30 |
| 2351 | Client opening balance import | check in browser | |
| 2352 | Account opening balance import | check in browser | |
| 2353 | Historical payment import | check in browser | |
| 2357 | Total user counter (owners and staff) | present | `app/(admin)/admin` home metrics (16.20) |
| 2362 | Platform health score, all services | present | `lib/admin/health-score.ts`, `/api/admin/processors/health` |
| 2363 | Real-time activity feed | partial | `app/(admin)/admin/audit` lists the trail; no live feed |
| 2376 | Self-change block guard (an admin cannot change their own role) | check in browser | |

## Not found: 2311. Partly built: 2363.
