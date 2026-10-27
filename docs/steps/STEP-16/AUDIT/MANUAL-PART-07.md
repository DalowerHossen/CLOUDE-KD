<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-07.md -->
# Manual reading, part 7 (features 595 to 693, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. Results: present, partial, not found, check in browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 598 | Staff reactivate | present | `services/team/members.ts` (`team.staff_reactivated`) |
| 599 | Staff seat limit per plan | present | entitlement `staff.seats`, `seatState` |
| 601 | Staff seat overage alert | partial | an invite is refused at the limit; no alert is sent |
| 602 | Predefined permission presets | present | `lib/team/presets.ts` (sales, accounts and others) |
| 603 | Custom role creation by the owner | partial | the owner sets permissions per person; there are no named custom roles |
| 608 | Per-staff activity log | present | `/api/team/activity` |
| 609 | Staff login activity (owner view) | check in browser | the activity route may include sign-ins |
| 610 | Staff action history per person | present | `/api/team/activity` |
| 612 | Action-based e-mail rules per staff | not found | |
| 615 | Owner resets a staff password | check in browser | reset links exist (`services/auth/reset-flow.ts`); whether the owner can start one for staff was not read |
| 620 | Owner revokes a staff device or session | partial | the owner can deactivate a person; no per-session revoke for staff |
| 626 | Business registration document upload | present | `/api/kyc/documents`, `components/settings/kyc-panel.tsx` |
| 627 | Beneficial owner form | present | `services/kyc/owner.ts` |
| 633 | File size check on upload | present | `components/settings/kyc-panel.tsx`, storage limits |
| 657 | Add a custom domain per tenant | partial | the domain is saved and checked (`domains-panel.tsx`, job `domain-check`); STEP 07 decision D15: client pages are not served on it |
| 664 | Remove a domain | present | `domains-panel.tsx` |
| 667 | Domain is a plan-gated feature | check in browser | the page is there; the plan check was not read |
| 669 | Bell with unread count, real time | check in browser | `components/notifications/notification-center.tsx`; "real time" (push against polling) not read |
| 671 | Mark as read, one or all | present | `/api/notifications` |
| 674 | Click a notification, go to the page | present | each notification carries an `href` |
| 681 | Bulk edit of notification preferences | check in browser | `app/(dashboard)/settings/notifications` |

## Not built: 612. Partly built: 601, 603, 620.
