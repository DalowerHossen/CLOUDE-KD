<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-29.md -->
# Manual reading, part 29 (features 2773 to 2871, the lines that are Bengali only)

Read against the code and the STEP 14, 15 and 16 notes on 2026-10-27; nothing was opened in a browser. STEP 14 records as not built: referral credit codes. The retention tools 2792 and 2793 were built in 16.27.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 2779 | Referral commission calculation | not built | STEP 14: referral credit codes are not built; only strings exist |
| 2780 | Referral dashboard, admin and user | not built | the same |
| 2787 | "No credit card needed" trial | present | the sign-up flow takes no card; the home page says so |
| 2788 | Money-back guarantee, 30 days | not found | no such offer in the code or the pages |
| 2789 | Free setup call for the first 100 customers | not found | |
| 2790 | Health score alert (no sign-in for 7 days, automatic e-mail) | not built | 16.20 shows churn signals; the 7-day e-mail needs the mail queue and a job (STEP 16 D45 to D50) |
| 2792 | Exit survey when cancelling | present | 16.27 |
| 2793 | Downgrade-save flow | present | 16.27 |
| 2794 | Milestone celebration ("Your 100th invoice") | not built | needs the mail queue and a job (STEP 16 notes) |
| 2800 | Employee edit, delete, archive | present | `/api/payroll/employees/[id]` |
| 2803 | Employee joining date | check in browser | |
| 2808 | Employee emergency contact | present | `app/(dashboard)/payroll/employees/[id]/page.tsx` |
| 2812 | Employee custom fields per tenant | not found | custom fields exist for clients and products only |
| 2864 | Pay slip preview before sending | not found | |
| 2865 | Pay slip template customisation per tenant | not found | |

## Not built or not found: 2779, 2780, 2788, 2789, 2790, 2794, 2812, 2864, 2865.
