<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-06.md -->
# Manual reading, part 6 (features 496 to 594, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. Results: present, partial, not found, check in browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 496 | Time zone on the sign-up form | partial | the company profile has a time zone (`lib/company/sections.ts`), the sign-up form does not ask |
| 512 | Default invoice notes and terms at onboarding | present | industry presets set due days, terms and notes (`lib/company/presets.ts`) |
| 526 | Preset sets tax rates | not found | a preset sets due days, terms and notes only |
| 527 | Preset picks the invoice template | not found | |
| 528 | Preset picks the e-mail template | not found | |
| 529 | Preset sets the dashboard widgets | not found | |
| 532 | Guided "create your first invoice" flow | partial | a five-step onboarding wizard and a help article; the wizard does not lead into the invoice form |
| 541 | Company name | present | profile |
| 542 | Company legal name | present | `legalName` |
| 545 | Company phone | present | `phone` |
| 546 | Company e-mail | present | `email` |
| 547 | Company website | present | `website` |
| 549 | Company registration number | present | `registrationNumber` |
| 551 | Company favicon | not found | the branding section has a logo, no favicon |
| 553 | Company ownership transfer | not found | |
| 555 | Company time zone | present | `timezone` |
| 559 | Secondary colour | not found | only primary and accent colours |
| 560 | Accent colour | present | `accentColor` |
| 564 | Logo size on the invoice (small, medium, large) | not found | no size field |
| 566 | Branded e-mail header | check in browser | `lib/email/template-body.ts` uses the company brand |
| 567 | Branded client-facing page | present | `components/client/branded-frame.tsx` |
| 568 | Branded checkout page | check in browser | the branding editor styles client pages; whether checkout reads it needs a look |
| 569 | Branded receipt | check in browser | |
| 570 | Live branding preview | present | `components/client/branding-form.tsx` |
| 572 | Branding reset to default | present | `/api/portal/branding/reset` |
| 578 | Default invoice note | present | invoice section `notes` |
| 581 | Default tax rate | partial | not in the invoice section; tax rates and settings live in the invoice tax module |
| 591 | Invite link expires after 7 days | present | `INVITATION_DAYS = 7` in `services/team/invitations.ts` |
| 592 | Invite re-send | check in browser | the invitations route takes actions; the exact list was not read |
| 593 | Invite cancel | check in browser | the same |

## Not built: 526, 527, 528, 529, 551, 553, 559, 564. Partly built: 496, 532, 581.
