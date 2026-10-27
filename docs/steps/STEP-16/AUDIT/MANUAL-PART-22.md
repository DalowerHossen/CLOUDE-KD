<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-22.md -->
# Manual reading, part 22 (features 2080 to 2178, the lines that are Bengali only)

Read against the code and the STEP 16 decisions on 2026-10-27; nothing was opened in a browser. Social networks are not connected to a real account yet (no Meta app).

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 2082 | Post approval history | present | STEP 16 D9: approval history table |
| 2084 | Per-post click and link tracking | present | tracked links with hourly clicks, `kd_social_click` (D9), `/api/social/l/[code]` |
| 2085 | Per-post likes, comments and share counts | check in browser | D9 mentions post statistics; whether the networks are asked for them was not read |
| 2089 | Performance comparison by platform | partial | `lib/social/analytics.ts` compares two periods and finds the best hours |
| 2090 | Engagement rate calculation | check in browser | |
| 2091 | Follower growth tracking per platform | not found | no follower figure in the social code |
| 2094 | Share buttons on public pages | present | plain share links (STEP 06 D16) |
| 2115 | GET /v1/invoices/:id | present | `app/api/public/v1/invoices/[id]/route.ts` |
| 2117 | DELETE /v1/invoices/:id | not built | the public API reads invoices only |
| 2120 | GET /v1/clients | present | `app/api/public/v1/clients/route.ts` |
| 2122 | GET /v1/clients/:id | present | `app/api/public/v1/clients/[id]/route.ts` (also PATCH) |
| 2124 | DELETE /v1/clients/:id | not built | the route has GET and PATCH |
| 2165 | Outgoing webhook events client.created and client.updated | present | both are in `WEBHOOK_EVENTS` (`config/s16-api.ts`) |

## Not found or not built: 2091, 2117, 2124. Partly built: 2089. (Feature 2165 was first marked partial and corrected after reading the full event list.)
