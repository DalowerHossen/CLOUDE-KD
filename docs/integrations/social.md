# Social networks - facts read for STEP 16.4.a

Read on 2026-10-23 from the official Meta documentation (`https://developers.facebook.com/documentation/...<page>.md`, fetched with `curl`; the `WebFetch` tool cannot resolve the host). Only Facebook, Instagram and Threads could be read. The hosts of LinkedIn, X, Telegram and Pinterest are blocked in this environment, so no adapter exists for them (see BLOCKERS B3). Nothing here is from memory; what was not read is listed at the end.

## Sources

- Facebook Pages: `pages-api/posts.md`, `pages-api/getting-started.md`, `pages-api/overview.md`
- Instagram: `instagram-platform/content-publishing.md`, `instagram-platform/instagram-graph-api/reference/ig-user/media.md`, `.../ig-user/media_publish.md`, `.../ig-container.md`, `.../ig-user/content_publishing_limit.md`
- Threads: `threads/posts.md`, `threads/get-started.md`, `threads/overview.md`, `threads/troubleshooting.md`

## Facebook Page post

- Needs a Page access token and a user who can perform the `CREATE_CONTENT` task on the Page. Permissions named: `pages_manage_posts`, `pages_manage_engagement`, `pages_read_engagement`, `pages_read_user_engagement` (posts guide); the get-started guide lists `pages_manage_metadata`, `pages_manage_posts`, `pages_manage_read_engagement`, `pages_show_list`. The two pages differ; the owner grants what the Meta dashboard asks for.
- Page ids and Page access tokens: `GET /{user-id}/accounts` (answers `data[]` with `access_token`, `name`, `id`, `tasks`).
- Publish text or a link: `POST https://graph.facebook.com/v26.0/{page-id}/feed` with `message`, optional `link`, `access_token`; answer `{ "id": "<page post id>" }`. Photo: `POST /{page-id}/photos` with `url` (and `access_token`); answer `{ "id", "post_id" }`. Permalink: `https://www.facebook.com/<page post id>`. Delete: `DELETE /{page-post-id}` answers `{ "success": true }`. Native scheduling exists (`published=false` with `scheduled_publish_time` between 10 minutes and 30 days ahead); this platform keeps its own schedule instead.
- A post can be edited only by the app that made it.

## Instagram professional account (Instagram API with Facebook Login)

- Host `graph.facebook.com`, token: a Facebook Page access token, permissions `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`. The account must be a professional account; a connected Page that needs Page Publishing Authorization blocks publishing until done.
- Two steps: `POST /{ig-user-id}/media` with `image_url` (public https; JPEG only) and `caption` answers `{ "id": "<container id>" }`; then `POST /{ig-user-id}/media_publish` with `creation_id` answers `{ "id": "<media id>" }`. Header `Authorization: Bearer <token>` as in the examples.
- Caption: at most 2200 characters, 30 hashtags and 20 @ tags. Images need a public URL (Meta fetches it).
- Container status: `GET /{container-id}?fields=status_code` gives `EXPIRED`, `ERROR`, `FINISHED`, `IN_PROGRESS` or `PUBLISHED`; query once a minute for no more than 5 minutes. A container expires after 24 hours.
- Rate limit: the content publishing page says 100 API-published posts per 24 hours (carousel counts once); other pages (the carousel limitation and the media_publish reference) say 50. This platform uses 50 (the lower figure) until the owner changes the setting. `GET /{ig-user-id}/content_publishing_limit` shows the usage.

## Threads

- Host `https://graph.threads.com/v1.0`, Threads app id and secret, permissions `threads_basic` and `threads_content_publish`. Without Meta's advanced access, posting works only for Threads testers of the app.
- Two steps: `POST /{threads-user-id}/threads` with form fields `media_type` (`TEXT`, `IMAGE`, `VIDEO`), `text` (required for TEXT), `image_url` (required for IMAGE; public), `access_token`, optional `topic_tag` (1 to 50 characters, no `.` or `&`) answers `{ "id": "<container id>" }`; then `POST /{threads-user-id}/threads_publish` with `creation_id` and `access_token` answers `{ "id": "<media id>" }`. Meta recommends waiting about 30 seconds before publishing a container.
- Text posts are limited to 500 characters; emojis count as the number of UTF-8 bytes. Profiles may publish 250 posts per 24 hours (a carousel counts once).
- Tokens: short-lived (1 hour) exchanged for long-lived (60 days), refreshed with `GET /refresh_access_token` before they expire; a permission grant of a public profile lasts 90 days.

## Not read (not built)

- The authorization windows and code exchange of the three networks (a connection is made by pasting an access token), the token refresh call of Threads, long-lived Page token exchange, video, reels, stories, carousels, insights and webhooks, comment APIs, and the maximum length of a Facebook post.
- LinkedIn, X, Telegram and Pinterest (hosts unreachable).
