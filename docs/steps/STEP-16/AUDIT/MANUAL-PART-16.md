<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-16.md -->
# Manual reading, part 16 (features 1486 to 1584, the lines that are Bengali only)

Read against the code and the STEP 14 notes on 2026-10-27; nothing was opened in a browser. Real processors and partners were not tried: STEP 14 records that only the manual bank partner exists.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 1487 | Fee history report | check in browser | `/api/integrations/settlement/statement` |
| 1488 | Monthly fee invoice to the merchant, automatic | check in browser | settlement terms and statements exist; an automatic monthly fee invoice was not found |
| 1490 | Hold period setting, 7 to 14 days, per tenant | present | `/api/integrations/settlement/terms` |
| 1497 | Payout request, tenant to platform | present | `/api/payouts` |
| 1523 | MoR conditions and limits per tenant, by super admin | check in browser | `config/s16-settlement.ts`, `/api/integrations/settlement/terms` |
| 1524 | Per-merchant fee override by super admin | present | settlement terms per merchant |
| 1526 | MoR suspend when risky, automatic or manual | check in browser | |
| 1530 | Risk scoring per tenant, real time, rule based | partial | the fraud engine scores payments (`lib/security/fraud-engine.ts`, `config/payment-risk.ts`); per-tenant scoring was not seen |
| 1537 | Settlement cycle setting (T+1, T+3, T+7) | present | settlement terms |
| 1539 | Gateway payout and transaction reconciliation | not built | STEP 14: partner reconciliation and quota monitor not built |
| 1540 | Settlement discrepancy alert | not built | the same note |
| 1555 | Super admin dispute centre, all tenants | present | `app/(admin)/admin/disputes` |
| 1564 | Evidence submission within 24 hours | check in browser | `/api/disputes/evidence`, job `dispute-deadlines` (not scheduled yet) |
| 1568 | Show the refund policy before payment | check in browser | |
| 1571 | Unusual amount flag | present | `lib/security/fraud-engine.ts`, `config/payment-risk.ts` |
| 1572 | New client velocity check | present | fraud rules (`services/fraud/reaction.ts`) |
| 1575 | Confirmation that the invoice details were read | present | `/api/portal/consent` |
| 1581 | Device and user-agent fingerprint | present | `/api/security/device`, hashes in the sign-in events |

## Not built: 1539, 1540. Check in a browser or with a real partner: the "check" rows.
