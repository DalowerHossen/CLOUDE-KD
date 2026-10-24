# Plaid - facts read for STEP 16.7

Read on 2026-10-23 from the official Plaid documentation (`https://plaid.com/docs/...index.html.md`, fetched with `curl`; the pages are served as Markdown). Nothing here is from memory; what was not read is listed at the end. Live calls were not made (no Plaid account), so the code is checked with a fake transport (`scripts/verify/step16-bankfeed.ts`).

## Sources

`link/hosted-link`, `api/link` (`/link/token/create`), `api/items` (`/item/public_token/exchange`, `/item/remove`, Item webhooks), `api/accounts` (`/accounts/get`), `api/products/transactions` (`/transactions/sync`, `SYNC_UPDATES_AVAILABLE`), `api/webhooks`, `api/webhooks/webhook-verification`.

## Hosts and credentials

- `https://sandbox.plaid.com` (test) and `https://production.plaid.com`. Every request is a POST with a JSON body that carries `client_id` and `secret` (they may also be sent in the `PLAID-CLIENT-ID` and `PLAID-SECRET` headers; the platform uses the headers, so they never appear in a body that could be logged). The company uses its own Plaid keys.

## Linking (Hosted Link: no browser code, no change to the page security policy)

- `POST /link/token/create` with `client_name` (at most 30 characters), `language`, `country_codes`, `user.client_user_id`, `products: ["transactions"]`, `webhook` and `hosted_link: {}` answers `link_token`, `expiration` and `hosted_link_url`. The user opens `hosted_link_url`; Plaid hosts the whole Link flow. Without a webhook the token is read with `/link/token/get`.
- When the session ends Plaid sends the webhook `LINK` / `SESSION_FINISHED` with `status` (`success` when it worked), `link_token` and `public_tokens[]`. The `link_token` has to be kept next to the company's own record, because it is the only link between the session and the company.
- `POST /item/public_token/exchange` with `public_token` answers `access_token` (does not expire; revoked by `/item/remove`) and `item_id` (named in webhooks). The `public_token` lives 30 minutes.
- `POST /accounts/get` with `access_token` lists the accounts of the Item: `account_id`, `name`, `mask` (the last 2-4 characters), `official_name`, `type`, `subtype`, `balances { available, current, iso_currency_code }`.
- Update mode (re-authentication): `/link/token/create` with the `access_token` of the Item (the `webhook` field has no effect then) and `hosted_link`. Link tokens for an existing Item live 30 minutes.
- `POST /item/remove` ends the Item and its billing; the access token stops working.

## Transactions

- `POST /transactions/sync` with `access_token`, `cursor` (empty for the first call), `count` (1 to 500, default 100) answers `added[]`, `modified[]`, `removed[] { transaction_id, account_id }`, `next_cursor`, `has_more`, `accounts[]`, `transactions_update_status`. Call again with `next_cursor` while `has_more` is true. If a call fails while paging (for example `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION`) the whole loop starts again from the first cursor. The new cursor is saved only after the whole update was handled. Data may be empty for a few seconds after the Item was created.
- A transaction has `transaction_id`, `account_id`, `amount` (a number in the currency of the transaction; **positive when money moves out of the account, negative when it moves in**), `iso_currency_code` (null when an unofficial code is used), `date`, `authorized_date`, `name`, `merchant_name`, `pending` and `pending_transaction_id`, `payment_meta.reference_number`.
- Pending transactions are returned too; a pending one is replaced by a posted one with a different id. The platform imports posted transactions only.
- `SYNC_UPDATES_AVAILABLE` (`webhook_type` `TRANSACTIONS`, with `item_id`) says that new data can be fetched. Plaid checks for new data one to four times a day.

## Webhooks

- POST with raw JSON, retried for up to 24 hours (a 4xx other than 408, 425 and 429 is final); the answer must come within 10 seconds. Duplicates and a different order are possible, so every action has to be safe to repeat.
- Item webhooks used: `ITEM` / `ERROR` (an `error.error_code` such as `ITEM_LOGIN_REQUIRED`), `PENDING_EXPIRATION` (consent ends in 7 days; Europe), `PENDING_DISCONNECT` (US and Canada), `USER_PERMISSION_REVOKED`, `LOGIN_REPAIRED` (the Item healed without update mode). All carry `item_id`.
- Verification: the header `Plaid-Verification` is a JWT. Decode the header without trusting it, require `alg` `ES256`, take `kid`, get the JWK with `POST /webhook_verification_key/get` (`key_id`), check the signature with it, require the token to be at most 5 minutes old (`iat`) and require `request_body_sha256` in the token to equal the SHA-256 (hex) of the raw body.

## Not read (not built)

- The Link SDK flow in the page (Hosted Link is used instead), Plaid-side webhook configuration through the dashboard, `/transactions/refresh` (a refresh on demand), `/item/get` and Item health details, `/item/webhook/update`, balance endpoints, institutions search, Sandbox helper endpoints, error code lists other than the ones named above, pricing and billing, country coverage (the owner chooses the country codes Plaid has enabled for the account).
