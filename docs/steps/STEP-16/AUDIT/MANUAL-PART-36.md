<!-- path: docs/steps/STEP-16/AUDIT/MANUAL-PART-36.md -->
# Manual reading, part 36 (features 3466 to 3564, the lines that are Bengali only)

Read against the code and the STEP 10 and 14 notes on 2026-10-27; nothing was opened in a browser.

| No | Feature | Result | Evidence or note |
|---|---|---|---|
| 3474 | File trash, 30 days, then permanent delete | present | `/api/storage/files/[id]/restore`, job `file-retention` (not scheduled yet) |
| 3487 | Video and audio upload not allowed (out of scope) | present | the upload validators accept documents and images only |
| 3495 | Asia-based customer support hours | not found | a support process, not code |
| 3524 | Asia-based settlement cycle (T+1 to T+3) | present | settlement terms (`/api/integrations/settlement/terms`) |
| 3527 | Inter-company transactions | present | see 3091 |
| 3529 | Department and cost centre tracking | not found | departments exist in HR; transactions carry no cost centre |
| 3532 | Vendor master management | present | `/api/suppliers` |
| 3534 | Enterprise audit portal | partial | an audit pack download (`/api/accounting/audit-pack`); no separate portal for outside auditors |
| 3545 | Zero-amount invoice handling | check in browser | |
| 3546 | Negative-amount line (credit) | check in browser | |
| 3551 | Unknown client, create on the spot | present | `/api/clients/quick` |
| 3554 | Rounding discrepancy reconciliation | present | the rounding adjustment line (`cashRoundingAdjustment`) |
| 3555 | Duplicate payment matching, smart | partial | idempotency keys stop a repeated charge; no matching of look-alike payments |
| 3556 | Overpayment becomes a credit balance | check in browser | see 1425 |
| 3559 | Payment gateway timeout handling | partial | the payment review expiry job and `resume` |
| 3560 | Payment gateway downtime fallback | not built by design | the owner's rule (STEP 10): when no routing rule matches, the payment is cancelled; there is no failover |

## Not found: 3495, 3529. Partly built: 3534, 3555, 3559.
