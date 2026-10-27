<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-39.md -->
# Manual reading, part 39 (features 3763 to 3861, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 3763 | Data residency selection per tenant (US, EU, SG, IN, JP) | not found | the data is in one Supabase project (Singapore); only the legal text mentions residency |
| 3765 | Cross-border data transfer log | not found | |
| 3827 | Incident status page, automatic update | partial | the admin incident screen and the public status page (`components/marketing/status-view.tsx`, `lib/support/status.ts`); whether publishing an incident updates the page by itself was not read |
| 3828 | Incident post-mortem template | present | see 3591 |

## Not found: 3763, 3765. Partly built: 3827.
