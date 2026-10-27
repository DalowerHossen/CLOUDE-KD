<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-21.md -->
# Manual reading, part 21 (features 1981 to 2079, the lines that are Bengali only)

Read against the code on 2026-10-27; nothing was opened in a browser. WhatsApp and the social networks need an app registered with Meta and the networks; the owner has not created them yet, so none of this has been tried against a real account.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 1997 | Campaign preview before sending | present | `/api/whatsapp/campaigns/preview` |
| 1998 | Campaign progress bar, real time | check in browser | `/api/whatsapp/campaigns/[id]` |
| 2002 | Campaign history log | present | `/api/whatsapp/campaigns` |
| 2012 | Inbound message log per client and invoice | present | `/api/webhooks/whatsapp/[key]`, `/api/whatsapp/messages` |
| 2015 | Inbound auto-response, rule based | present | `/api/whatsapp/rules`, `/api/whatsapp/rules/runs` |
| 2043 | Hashtag limit per platform | present | `lib/social/rules.ts` counts text, hashtags and mentions per network |
| 2044 | Media specification per platform | check in browser | |
| 2046 | Post composer, several platforms at once | present | `/api/social/posts` |
| 2058 | Post schedule calendar view | present | `app/(dashboard)/social/calendar` |
| 2065 | Auto-post rule: new blog post to all channels | check in browser | `/api/social/rules`; the blog trigger was not read |
| 2068 | Auto-post rule: custom event to selected channels | present | `/api/social/rules/fire` |
| 2071 | Auto-post rule log | present | `/api/social/rules/runs` |
| 2079 | Post approval notification to the owner | check in browser | `/api/social/posts/[id]/decide` |

## Check in a browser or with a real account: every "check" row and every WhatsApp or social action.
