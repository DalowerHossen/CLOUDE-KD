<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-25.md -->
# Manual reading, part 25 (features 2377 to 2475, the lines that are Bengali only)

Read against the code and the STEP 14 and 16 notes on 2026-10-27; nothing was opened in a browser. Several rows here were built in this session (16.23, 16.24).

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 2395 | Tenant custom limit override | present | 16.23, `/api/admin/system/tenant-overrides` |
| 2402 | Tenant activity log | present | company page of the platform admin (`tenant-insight-panel.tsx`), audit trail |
| 2405 | Cross-tenant global search, admin only | present | 16.24, `app/(admin)/admin/search` |
| 2409 | Broadcast e-mail to all or selected tenants | not found | no broadcast code; the marketing campaigns go to leads |
| 2410 | Broadcast e-mail template | not found | |
| 2411 | Broadcast e-mail schedule | not found | |
| 2412 | Broadcast e-mail delivery report | not found | |
| 2414 | Support ticket from admin to tenant | partial | admins answer tickets (`/api/support/admin/tickets/[id]`); opening one for a tenant was not seen |
| 2438 | Renewal reminder e-mail (7, 3, 1 day) | present | job `subscriptions` (not scheduled yet) |
| 2439 | Platform subscription invoice and receipt, automatic | partial | invoices are made; STEP 14: no PDF of platform invoices |
| 2442 | Coupon edit, delete, disable | present | `/api/coupons/[id]`; a used coupon is switched off and never deleted (STEP 14 D18) |
| 2445 | Coupon expiry date | present | `expiresAt` |
| 2449 | One-time coupon rule enforced | present | `oncePerCompany`, `kd_coupon_redeem` (40 parallel companies on a 5-use coupon give exactly 5) |
| 2467 | Blog post create, edit, delete | present | `/api/blog/posts` |
| 2468 | Blog draft, publish and schedule | present | `/api/blog/action`, job `blog-publish` (not scheduled yet) |

## Not found: 2409, 2410, 2411, 2412. Partly built: 2414, 2439.
