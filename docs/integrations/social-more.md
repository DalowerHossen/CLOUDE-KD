# Social networks - facts read for STEP 16.4.a2 (LinkedIn, X, Telegram, Pinterest)

Read on 2026-10-23 with `curl` through the session proxy from the official documentation. Nothing here is from memory; what was not read is listed at the end. Live calls were not made (no real accounts), so the adapters are checked with a fake fetch that follows these shapes (`scripts/verify/step16-social-networks.ts`).

## Sources

- LinkedIn: `learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api`, `.../post-api-schema`, `.../little-text-format`, `.../marketing/versioning` (view `li-lms-2026-10`)
- X: `docs.x.com/x-api/posts/create-post.md`, `.../users/get-my-user.md`, `.../fundamentals/rate-limits.md`, `.../fundamentals/response-codes-and-errors.md`, `.../fundamentals/metrics.md`, `.../media/quickstart/media-upload-chunked.md`
- Telegram: `core.telegram.org/bots/api` (Making requests, sendMessage, sendPhoto, getChat, ResponseParameters)
- Pinterest: `developers.pinterest.com/docs/api/v5/pins-create.md` (and the OpenAPI spec embedded in `pins-create`), `.../boards-get.md`

## LinkedIn (Posts API)

- `POST https://api.linkedin.com/rest/posts`, headers `Authorization: Bearer <token>`, `X-Restli-Protocol-Version: 2.0.0`, `Linkedin-Version: YYYYMM` (this platform sends `202610`; version 202511 is sunset on 2026-11-16). Body: `author` (URN), `commentary`, `visibility: PUBLIC`, `distribution { feedDistribution: MAIN_FEED, targetEntities: [], thirdPartyDistributionChannels: [] }`, `lifecycleState: PUBLISHED`, `isReshareDisabledByAuthor: false`. The answer is 201 with the post id (`urn:li:share:...` or `urn:li:ugcPost:...`) in the header `x-restli-id`.
- Permissions: `w_organization_social` (company page; roles ADMINISTRATOR, DIRECT_SPONSORED_CONTENT_POSTER, CONTENT_ADMIN) or `w_member_social` (a member). The account id used here is the author URN (`urn:li:organization:<id>` or `urn:li:person:<id>`).
- `commentary` is "little text": the reserved characters `| { } @ [ ] ( ) < > # \ * _ ~` must be escaped with a backslash; a hashtag that should stay a hashtag is written `{hashtag|\#|tag}`. `lib/social/rules.ts` (`linkedinCommentary`) does both.
- Images, video and documents need an uploaded asset URN (Images, Videos, Documents APIs). An article post has to carry its own title, description and thumbnail (no URL scraping). A link is therefore put in the text.

## X (API v2)

- `POST https://api.x.com/2/tweets`, `Authorization: Bearer <OAuth 2.0 user access token>` (scopes `tweet.read`, `tweet.write`, `users.read`), JSON `{ "text": "..." }`; the answer is 201 `{ "data": { "id", "text" } }`. Errors are `{ title, detail, type, status }`; 429 means the rate limit or usage cap, 5xx may be retried.
- Rate limit of `POST /2/tweets`: 100 per 15 minutes per user and 10,000 per 24 hours per app. No daily limit is set per account here; a 429 is retried later.
- `GET https://api.x.com/2/users/me` gives `data.id`, `data.username`; used to check that the token belongs to the account id.
- The documentation names 280 characters for a standard post (longer text is for Premium accounts). This platform counts the link in full and counts characters as Unicode code points; how X weighs links, emoji and CJK characters was not read, so a text X would accept may be refused here.
- Media must be uploaded first (`/2/media/upload/...`) and its `media_id` passed in `media.media_ids`; not built, so a post with an image is refused for X.

## Telegram (Bot API)

- `https://api.telegram.org/bot<token>/METHOD` (the token is part of the path, as the documentation requires), JSON body. Answers are `{ ok: true, result }` or `{ ok: false, description, error_code, parameters }` (`retry_after` on flood control).
- `sendMessage`: `chat_id` (number or `@channelusername`), `text` 1-4096 characters; no `parse_mode` is used, so the text is plain. `sendPhoto`: `photo` as an HTTP URL (at most 10 MB, width + height at most 10,000, ratio at most 20), `caption` 0-1024 characters. The sent Message has `message_id`.
- `getChat` with `chat_id` proves the token and the chat belong together. The bot must be an administrator of the channel.
- Free broadcast limit: about 30 messages per second to different users; a channel post is far below it.

## Pinterest (API v5)

- `POST https://api.pinterest.com/v5/pins`, `Authorization: Bearer <OAuth 2.0 token>`, scopes `boards:read`, `boards:write`, `pins:read`, `pins:write`; rate category `org_write`. Body: `board_id`, `media_source { source_type: "image_url", url }`, `title` (at most 100), `description` (at most 800), `link` (at most 2048), `alt_text` (at most 500). The answer (201) is the Pin with its `id`. The account id used here is the board id.
- `GET https://api.pinterest.com/v5/boards/{board_id}` (scope `boards:read`) gives the board `name`; used as the connection check.
- A Pin always needs an image. The title here is the first line of the text and the whole text is the description.

## Not read (not built)

- The OAuth authorization windows and token refresh of all four networks (a connection is made by pasting a token, as for the Meta networks); LinkedIn image, video, document, poll and article posts, and how many characters a LinkedIn post may have; X media upload, how X counts characters, and post metrics through the API (the metrics page was read, but insights of these networks are not collected); Telegram formatting (`parse_mode`), albums and polls; Pinterest video, carousel, board sections and analytics; permalinks of posts on all four networks (the documentation read gives none, so the post address is left empty).
