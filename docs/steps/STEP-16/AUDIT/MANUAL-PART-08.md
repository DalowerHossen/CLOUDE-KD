<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-08.md -->
# Manual reading, part 8 (features 694 to 792, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. Results: present, partial, not found, check in browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 710 | Subscription reactivate | present | `/api/subscriptions/reactivate` |
| 711 | Prorated upgrade and downgrade | present | `lib/payment/subscription-rules.ts`; `scripts/verify/step14-subscriptions.ts` |
| 715 | Renewal reminder e-mails (7, 3 and 1 day) | present | `reminderDue` and `RENEWAL_REMINDER_DAYS` in `lib/payment/subscription-rules.ts`, hourly job `cron/jobs/s14-subscriptions.ts` (the job is not scheduled anywhere yet, see the job scheduler) |
| 716 | Platform subscription invoice and receipt | present | platform invoices in the subscription module |
| 719 | Coupon expiry date | present | `expiresAt` in `lib/payment/coupon-rules.ts` |
| 723 | One-time coupon rule enforced | present | `oncePerCompany` (default true), `maxRedemptions` |
| 724 | Coupon impact report | present | `/api/coupons/report`, `app/(admin)/admin/coupons` |
| 726 | Plan by feature matrix | present | `/api/plans/manage/[id]/entitlements`, `config/plans.ts` |
| 741 | Gateway sandbox or test mode toggle | present | processor test and live modes (`app/api/admin/processors`) |
| 743 | Default gateway selection | present | routing rules (`/api/admin/processors/routing`) |
| 753 | Owner resets a staff password | check in browser | same as 615 |
| 755 | Session timeout setting per tenant | partial | same as 434: saved, not enforced |
| 757 | Data export needs owner approval | present | `exportNeedsOwnerApproval` is read in `services/lifecycle/data.ts` |
| 758 | Device and session revoke | partial | same as 620 |
| 759 | Login notification toggle | partial | `loginNotifications` is saved; the new-device e-mail is sent whatever it says |
| 767 | Multi-step invoice creation form | not found | one form (`components/invoice/invoice-form.tsx`) |
| 771 | Invoice list as table and as cards | present | `components/shared/data-table.tsx` |
| 787 | Drag to reorder invoice lines | not found | no drag or reorder in the form |
| 788 | Pick invoice lines from the product catalogue | present | `/api/products/picker` |

## Not built: 767, 787. Partly built: 755, 758, 759.
