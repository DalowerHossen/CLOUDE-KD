<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-35.md -->
# Manual reading, part 35 (features 3367 to 3465, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. Features 3367 to 3391 are in the performance section that no STEP owns.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 3384 | Cursor pagination for lists above 1000 rows | partial | the public API pages with cursors; the app lists use page numbers |
| 3385 | Server-side filter and sort | present | the list routes take the filter and order in the query |
| 3387 | Slow query log (above 1 second) | not found | |
| 3407 | Prevent connection leaks on serverless | present | the data layer calls the Supabase HTTP API, so there is no pool to leak |
| 3409 | Database size monitor per table | not found | |
| 3455 | Storage quota per tenant, plan based | present | `/api/storage/quota`, `config/plans.ts` |
| 3456 | Storage usage dashboard | present | `app/(dashboard)/settings/storage` |
| 3457 | Quota alerts at 80, 95 and 100 percent | check in browser | the storage health job (`storage-health`, not scheduled yet) |
| 3462 | Bandwidth throttle per tenant | not found | |
| 3463 | Range request support for large files | check in browser | `app/api/storage/download/[token]/route.ts` |

## Not found: 3387, 3409, 3462. Partly built: 3384.
