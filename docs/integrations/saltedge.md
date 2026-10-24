# Salt Edge - facts read for STEP 16.7

Read on 2026-10-23 from the official Salt Edge documentation (`https://docs.saltedge.com/v6/` and `.../v6/api_reference`, fetched with `curl`). Nothing here is from memory; what was not read is listed at the end. Live calls were not made (no Salt Edge account), so the code is checked with a fake transport (`scripts/verify/step16-bankfeed.ts`).

## Host, keys and signing

- `https://www.saltedge.com/api/v6/...`. Every request carries the headers `App-id` and `Secret` (the company's own keys), `Accept` and `Content-type: application/json`. Bodies are `{ "data": { ... } }`.
- For Live clients every request has to be signed (other statuses: signing is optional, but if the headers are sent the signature is checked): header `Expires-at` (a UNIX time in UTC, at most one hour ahead; one minute is suggested) and header `Signature`, the base64 of the SHA-256 RSA signature, made with the client's private key, of the text `Expires-at|METHOD|full_url|body` (the body is empty for a GET). The public key is entered in the Salt Edge dashboard. The platform signs when the company pastes a private key.
- Rate limits: 429 answers exist; the Widget allows 10 parallel sessions by default.

## Linking (the Salt Edge Widget is opened by an address; no browser code)

- `POST /customers` with `data.identifier` makes the user (answer `customer_id`; `DuplicatedCustomer` 409 when it exists). The platform uses one customer for each connection.
- `POST /connections/connect` with `data { customer_id, consent { scopes: ["accounts", "transactions"], period_days? }, attempt { fetch_scopes: ["accounts", "balance", "transactions"], return_to, custom_fields, store_credentials }, automatic_refresh }` answers `connect_url`, `expires_at`, `customer_id`. The user opens `connect_url` and chooses the country and the bank; afterwards the user is sent to `return_to`. `custom_fields` come back on every callback.
- Reconnect (re-authentication): `POST /connections/{connection_id}/reconnect` with `data { consent { scopes }, attempt { return_to, custom_fields } }` answers `connect_url`. In case of `InvalidCredentials` a reconnect is recommended.
- `GET /connections/{connection_id}` answers `status` (`active`, `inactive`, `disabled`), `provider_name`, `provider_code`, `country_code`, `next_refresh_possible_at`, `last_attempt { fail_at, fail_error_class, fail_message, last_stage }`.
- `POST /connections/{connection_id}/refresh` starts a new fetch (a connection can be refreshed only when `next_refresh_possible_at` has come). `DELETE /connections/{connection_id}` removes the connection, its accounts and transactions and revokes the consent; a destroy callback follows.

## Accounts and transactions

- `GET /accounts?connection_id=...` lists accounts: `id`, `name`, `nature`, `balance`, `currency_code`, `extra { account_number, iban, status, ... }`. Lists are paged: `meta.next_id` is the id the next page starts with (`from_id`), `per_page` between 100 and 1000.
- `GET /transactions?connection_id=...&account_id=...&from_id=...&per_page=...` lists transactions: `id`, `account_id`, `duplicated`, `mode` (`normal`, `fee`, `transfer`), `status` (`posted`, `pending`), `made_on` (a date), `amount`, `currency_code`, `description`, `extra`. Pending transactions can be removed and re-added with other ids; the documentation advises not to depend on them. The platform imports posted, not duplicated transactions only.
- **The sign of `amount` is not stated in the pages read.** The platform assumes the usual statement way: negative when money leaves the account, positive when it comes in. Check this with a test connection before going live.

## Callbacks

- Salt Edge POSTs JSON `{ "data": {...}, "meta": { "version": "6", "time": ... } }` to the URLs set on the Callbacks page of the dashboard (Success, Fail, Notify, Destroy, Consent status; port 443 for Live clients; no redirects). `data` has `connection_id`, `customer_id`, `custom_fields`; Success has `stage` (`finish` ends the fetch; one to three success callbacks with the same payload can come), Fail has `error_class` and `error_message`, Consent status has `consent_status` (`expired` or `revoked`) and `reason`.
- Verification: the header `Signature` is the base64 SHA-256 RSA signature of the text `callback_url|post_body`, made with the Salt Edge key; the header `Signature-key-version` names the key (version 6.0 is published in the documentation; the public key is built into `lib/integrations/saltedge.ts`). `callback_url` is the address as it is entered in the dashboard.

## Not read (not built)

- The sign of `amount` (see above), the Salt Edge sandbox providers and the Test client rules, the Partner programme, mutual TLS for callbacks, account holder information, categories and merchants, Connections/Update, Consents, the full list of error classes, the Open Banking Gateway PIS (payments).
