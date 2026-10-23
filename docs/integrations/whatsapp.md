# WhatsApp Business Platform (Cloud API) - facts read for STEP 16.3

Read on 2026-10-23 from the official Meta documentation (pages fetched as markdown with `curl` from `developers.facebook.com/documentation/business-messaging/whatsapp/...`; the `WebFetch` tool could not resolve the host, `curl` could). Nothing here is from memory. Where a fact was not found, it is listed under "Not read".

## Sources

- `messages/send-messages.md` (service messages, customer service window, request and response syntax, TTL)
- `messages/text-messages.md`, `messages/image-messages.md`, `messages/document-messages.md`
- `reference/whatsapp-business-phone-number/message-api.md` (POST messages, common properties)
- `templates/overview.md` ("Template fundamentals": creation, names, categories, parameter formats, send payloads, status), `templates/components.md`, `templates/template-management.md`
- `reference/whatsapp-business-account/template-api.md` (GET, POST and DELETE of `message_templates`)
- `webhooks/create-webhook-endpoint.md` (GET verification, POST signature, batching, retries)
- `webhooks/reference/messages/text.md`, `webhooks/reference/messages/status.md`, `webhooks/reference/message_template_status_update.md`
- `support/error-codes.md` (error body and codes), `getting-opt-in.md`, `messaging-limits.md`, `business-phone-numbers/phone-numbers.md`, `get-started.md`

## Facts used

- Base URL `https://graph.facebook.com`; the send-message pages show version `v26.0` (the get-started page still shows `v23.0`). The version is a setting (`WHATSAPP_API_VERSION` in `config/s16-whatsapp.ts`, default `v26.0`).
- Send: `POST /{version}/{phone-number-id}/messages`, headers `Authorization: Bearer <token>` and `Content-Type: application/json`. Common body: `messaging_product: "whatsapp"`, `recipient_type: "individual"`, `to` (phone number, E.164 with country code), `type`, and an object named like the type.
- Text: `type: "text"`, `text: { preview_url?: boolean, body }`, body at most 4096 characters.
- Template: `type: "template"`, `template: { name, language: { code }, components: [{ type: "body", parameters: [{ type: "text", text, parameter_name? }] }] }`. Positional parameters (`{{1}}`) are sent in order; named parameters (`{{first_name}}`) carry `parameter_name`.
- Success response: `{ messaging_product, contacts: [{ input, wa_id }], messages: [{ id, message_status? }] }`. It only says the request was accepted; delivery status comes by webhook.
- Customer service window: 24 hours from the last message (or call) of the user, reset by each new one. Inside it any service message may be sent; outside it only approved templates. Businesses must have the user's opt-in. Error 131047: more than 24 hours since the recipient last replied.
- Message time-to-live: 30 days (authentication templates 10 minutes). Order of delivery is not guaranteed.
- Errors (Graph): `{ "error": { "message", "type", "code", "error_data": { "messaging_product", "details" }, "error_subcode", "fbtrace_id" } }`. Build handling on `code`. Codes used: 131047 (window closed), 131026 (not deliverable: not a WhatsApp number etc.), 131056 (pair rate limit), 131049 (healthy ecosystem limit), 130472 (not sent as part of an experiment), 131000 (unknown), 131021 (sender equals recipient).
- Templates: create `POST /{version}/{WABA-ID}/message_templates` with `{ name, category, language, parameter_format, components }`; name: lowercase alphanumeric characters and underscores, at most 512 characters; categories `authentication`, `marketing`, `utility`; at most 100 creations per account per hour; `parameter_format` `named` or `positional` (default positional) and an example value for every parameter (`body_text` for positional, `body_text_named_params` for named); body text at most 1024 characters, footer 60, text header 60 (one parameter in a header). List `GET /{version}/{WABA-ID}/message_templates?fields=name,category,status&limit=&status=`, with `paging.cursors` and `paging.next`; one template `GET /{version}/{TEMPLATE_ID}?fields=status`; delete by name `DELETE /{version}/{WABA-ID}/message_templates?name=`; answer `{ success }`. Create answer: `{ id, status, category }`. Status values seen: `APPROVED`, `PENDING`, `REJECTED` (webhook events add `PAUSED`, `DISABLED`, `FLAGGED`, `IN_APPEAL`, `LIMIT_EXCEEDED`, `LOCKED`, `ARCHIVED`, `UNARCHIVED`, `DELETED`, `REINSTATED`, `PENDING_DELETION`). Review is automatic and can take up to 24 hours. Only `APPROVED` templates can be sent.
- Template status webhook: field `message_template_status_update`, value `{ event, message_template_id, message_template_name, message_template_language, reason, message_template_category }`.
- Webhook verification (GET): query `hub.mode=subscribe`, `hub.challenge`, `hub.verify_token`; compare the token with the stored string; answer 200 with the challenge text, otherwise a non-200 answer. TLS with a valid certificate is required.
- Webhook delivery (POST): header `X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of the payload with the app secret>`; answer 200; Meta batches up to 1000 updates, retries a failed delivery immediately and then with decreasing frequency for 7 days, so the receiver must deduplicate.
- Incoming message payload: `{ object: "whatsapp_business_account", entry: [{ id: <WABA id>, changes: [{ field: "messages", value: { messaging_product, metadata: { display_phone_number, phone_number_id }, contacts: [{ profile: { name }, wa_id }], messages: [{ from, id, timestamp (unix seconds, text), type, text: { body }, context? }] } }] }] }`.
- Status payload: `value.statuses: [{ id (the wamid), status: sent | delivered | read | failed, timestamp, recipient_id, errors?: [{ code, title, message, error_data: { details } }], biz_opaque_callback_data? }]`. A message that is read while the chat is open may skip the `delivered` webhook.
- Phone numbers: `GET /{version}/{WABA-ID}/phone_numbers` returns `verified_name`, `display_phone_number`, `id`, `quality_rating` (GREEN, YELLOW, RED, NA); messaging limits are per business portfolio (250 new, then 2,000, 10,000, 100,000, unlimited) on unique recipients outside customer service windows in a moving 24 hours.

## Not read (so not built in 16.3.a)

- The media upload API and media download of inbound files (media sent and received is not handled; inbound media is stored as its type only).
- Template editing (`POST /{TEMPLATE_ID}`), the template library, header media handles (resumable upload), buttons beyond what is listed.
- The Application Subscriptions API (the owner subscribes to the `messages` and `message_template_status_update` fields in the Meta App Dashboard).
- Embedded Signup, phone number registration, calling, groups, flows, interactive messages.

## Added for 16.3.b (read on 2026-10-23, `messaging-limits.md`)

- The messaging limit is the most unique WhatsApp user phone numbers the business can deliver messages to, outside a customer service window, within a moving 24 hours. It is set per business portfolio and shared by all its phone numbers. A new portfolio starts at 250; it can rise to 2,000 (verify the business, have a partner verify it, or send 2,000 delivered template messages to unique numbers in 30 days with high quality templates), then 10,000, 100,000 and unlimited by automatic scaling (at least half the limit used in 7 days with high quality messages; the increase happens within 6 hours).
- Read it with `GET /{version}/{phone-number-id}?fields=whatsapp_business_manager_messaging_limit`; the page shows the answer `{ "whatsapp_business_manager_messaging_limit": "TIER_250", "id": "..." }`. The older `messaging_limit_tier` field is deprecated. Only the `TIER_250` text is shown in the page; other tier texts are read by the pattern `TIER_<number>[K]` and `TIER_UNLIMITED` and anything else leaves the stored limit unchanged.
- Opt-in (`getting-opt-in.md`): businesses must obtain opt-in before messaging people on WhatsApp; the method is the business's choice (SMS, website, phone, on paper) as long as it states the business name and that the person opts in; provide clear ways to opt out and honour them.
