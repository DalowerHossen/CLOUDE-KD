<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-34.md -->
# Manual reading, part 34 (features 3268 to 3366, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. Features 3357 to 3366 belong to the performance section that no STEP owns (see `CANDIDATE_GAPS.md`); they have no Bengali-only line here.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 3268 | Unusual traffic pattern alert | partial | the alerting service and API key anomaly rules (`lib/integrations/api-key-rules.ts`); no site-wide traffic alert |
| 3269 | Account auto-suspend on suspicious activity | present | the zero-tolerance reactions (`services/fraud/reaction.ts`) |
| 3272 | Flag several accounts from one IP | present | `lib/security/signals.ts`, trial abuse check in `services/auth/signup-flow.ts` |
| 3273 | Flag the same bank account in several tenants | not found | |
| 3274 | One-time coupon rule enforced | present | `kd_coupon_redeem` |
| 3276 | Seat count accuracy check | present | `seatState` in `services/team/members.ts` |
| 3282 | Magic bytes and extension match on upload | present | `lib/storage/validate/pdf.ts`, `image.ts` |
| 3292 | Upload quota per tenant and per plan | present | `/api/storage/quota` |
| 3299 | No token passed in a gateway redirect | check in browser | |
| 3301 | E-mail forward-leak warning policy | not found | |
| 3302 | Token link expiry set by plan | not found | expiries are fixed (for example a hub link opens an invoice link for 7 days) |
| 3303 | Token rate limit and brute-force guard | present | the one-time code and rate limits on the portal (`/api/portal/otp`) |
| 3329 | Export file with watermark and expiry | present | `lib/storage/watermark.ts`; exports are kept 7 days (STEP 07 D17) |
| 3330 | Data retention schedule per data type | present | `/api/admin/compliance/retention` |
| 3350 | Webhook replay window (plus or minus 5 minutes) | present | verified in `scripts/verify/step04-core.ts` |
| 3354 | Webhook dead-letter queue | partial | deliveries and attempts are logged with retries; whether a failed delivery moves to a separate dead state was not read |

## Not found: 3273, 3301, 3302. Partly built: 3268, 3354.
