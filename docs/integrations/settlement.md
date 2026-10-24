# Sub-merchant settlement ledger (STEP 16.14)

This is a set of books. The platform does not hold, receive, convert or send money for anyone. A main merchant records what its sub-merchants earned and what it paid them, and the page shows what is still owed.

## What you do

1. **Set terms** (`Integrations > Sub-merchant settlement > Terms`; fresh identity check). Commission (percent), a fixed fee per sale, hold days before a sale can be paid out, and a minimum payout. Terms can be for one sub-merchant or the default for all; one sub-merchant's terms win. A change is a new version that starts now; old versions are kept.
2. **Post entries** (a batch of up to 200 for one sub-merchant, as lines `kind,amount,reference,date[,note]` on the page, or `POST /api/integrations/settlement/entries`).
   - `sale`: positive amount. Commission = percent of the amount; the fixed fee is taken; net = amount - commission - fee; payable after the hold days.
   - `refund` and `chargeback`: written as a positive amount, kept as negative. The same percent of it is returned as commission, no fee is returned, and it counts at once.
   - `adjustment`: signed amount, no commission or fee, counts at once.
   - The result is worked out with the terms in force at the entry's date and kept, so a later change of terms never changes an old entry. An entry is known by its kind and reference: the same one posted twice is ignored the second time and reported as a duplicate.
3. **Read the balance.** Total net = all entries. On hold = net of sales still inside their hold days. Paid out = recorded payouts. Available = total - on hold - paid. A negative balance means refunds and chargebacks are above the sales (the sub-merchant owes you; recovering it is outside this ledger).
4. **Record a payout** after you paid the sub-merchant yourself (fresh identity check). It cannot be above the available balance or below the minimum payout; one at a time per sub-merchant; the same key gives the same payout. A mistake is voided with a reason (the amount returns to the balance); nothing is deleted.
5. **Download the statement** (CSV, latest 500 entries, amounts exact, USD).

All amounts are USD with four decimals, rounded half up. Every change is in the audit log (entries by batch).

## What it is not

It is not a payment service: whether the arrangement needs a licence or a regulated partner is for the owner and counsel to decide before a merchant relies on it. Also not built: automatic entries from payments or from a key-authenticated route, posting to the books of STEP 15, a statement page for the sub-merchant, reserves, tax reporting or withholding, other currencies, payouts through a processor, recovery of a negative balance.

## Automatic entries from your app (16.15)

Instead of typing entries, the main merchant's app can post them. In `Integrations > Sub-merchant settlement > Keys for your app` the owner makes a key (`kd_stl_...`, fresh identity check, shown once, optional address list and expiry, a limit per minute) and revokes it at once if it leaks. A key can post entries and nothing else.

```
POST https://<platform>/api/gateway/settlement/v1/entries
Authorization: Bearer kd_stl_<32 characters>
Content-Type: application/json

{
  "subMerchantReference": "shop-1",
  "entries": [
    { "kind": "sale",   "amount": "100.00", "externalRef": "order-1", "occurredAt": "2026-10-24T09:00:00Z" },
    { "kind": "refund", "amount": "40.00",  "externalRef": "refund-9", "occurredAt": "2026-10-25T09:00:00Z", "note": "partial" }
  ]
}
```

- `subMerchantReference` is the reference you gave the sub-merchant (the app receives it as `X-KD-Sub-Merchant` on every gateway call). Up to 200 entries per call, 256 KB.
- `201` with `{"data":{"posted":2,"duplicates":[],"failed":[]},"meta":{...}}`. An entry is known by its kind and `externalRef`: send the same batch again after a timeout and nothing is posted twice (the repeats come back in `duplicates`). `failed` lists entries that could not be worked out (for example a sale smaller than its fee).
- `401` wrong, revoked or expired key (the same answer for all three; failed attempts are limited per address), `403` address not on the key's list, `404` unknown reference, `409` closed sub-merchant, `400` bad body, `413` too large, `429` over the limit (`Retry-After`).
- Commission, fee and hold are worked out with the terms in force at `occurredAt`, exactly as for entries typed by the owner.
- The key is a bearer secret: keep it on the server of your app and use https only.
