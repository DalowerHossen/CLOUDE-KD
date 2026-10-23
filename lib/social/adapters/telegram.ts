// path: lib/social/adapters/telegram.ts
// Telegram channel and group posts through a bot (host api.telegram.org). Documentation read 2026-10-23:
// docs/integrations/social-more.md ("Telegram"). The bot token is part of the address path, as the Bot API requires; it is never
// logged or put in an error. The text is sent as plain text (no parse mode), so no character needs escaping.
import 'server-only';
import { TELEGRAM_API_URL } from '@/config/s16-social';
import type { SocialAdapter } from '../adapter';
import { SocialApiError } from '../graph';
import { request } from '../http';
import { textWithLink } from '../rules';

const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** A chat id is a number (negative for groups and channels) or @username; a number is sent as a number. */
const chatOf = (externalId: string): string | number =>
  /^-?\d+$/.test(externalId) ? Number(externalId) : externalId;

const url = (token: string, method: string): string => `${TELEGRAM_API_URL}/bot${token}/${method}`;

/** Telegram answers { ok, result } and { ok: false, description, error_code, parameters }; a 200 with ok false is a failure. */
function result(json: Record<string, unknown>): Record<string, unknown> {
  if (json.ok !== true)
    throw new SocialApiError(
      typeof json.description === 'string'
        ? json.description.slice(0, 300)
        : 'Telegram refused it.',
      typeof json.error_code === 'number' ? json.error_code : null,
      200,
      false,
    );
  return obj(json.result);
}

export const telegramAdapter: SocialAdapter = {
  id: 'telegram',
  label: 'Telegram',
  async publish(account, post, fetcher) {
    const text = textWithLink(post);
    const photo = post.imageUrl !== null;
    const sent = await request(
      {
        url: url(account.token, photo ? 'sendPhoto' : 'sendMessage'),
        method: 'POST',
        json: photo
          ? {
              chat_id: chatOf(account.externalId),
              photo: post.imageUrl,
              ...(text.trim() !== '' ? { caption: text } : {}),
            }
          : { chat_id: chatOf(account.externalId), text },
      },
      fetcher,
    );
    const messageId = result(sent.json).message_id;
    if (typeof messageId !== 'number')
      throw new SocialApiError('The network did not return an id.', null, 200, false);
    return { state: 'published', externalId: String(messageId), url: null };
  },
  async check(account, fetcher) {
    const got = await request(
      {
        url: url(account.token, 'getChat'),
        method: 'POST',
        json: { chat_id: chatOf(account.externalId) },
      },
      fetcher,
    );
    const chat = result(got.json);
    const name =
      typeof chat.title === 'string'
        ? chat.title
        : typeof chat.username === 'string'
          ? chat.username
          : '';
    return { name: name.slice(0, 120) };
  },
};
