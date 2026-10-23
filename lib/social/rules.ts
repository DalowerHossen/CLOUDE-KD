// path: lib/social/rules.ts
// Social posts as pure functions: the inputs, the way each network counts text, hashtags and mentions, adding a hashtag group,
// the daily post limit, and the checks that each network's rules make on a post (from docs/integrations/social.md). No database or
// network here.
import { z } from 'zod';
import {
  DAILY_POST_LIMITS,
  INSTAGRAM_CAPTION_MAX,
  INSTAGRAM_HASHTAGS_MAX,
  INSTAGRAM_MENTIONS_MAX,
  MAX_TAGS_PER_GROUP,
  POST_BODY_MAX,
  SOCIAL_PROVIDERS,
  THREADS_TEXT_MAX,
  THREADS_TOPIC_TAG_MAX,
  type SocialProvider,
} from '@/config/s16-social';

const noAngle = (v: string): boolean => !/[<>]/.test(v);
const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => /^https:\/\/[^\s]+$/.test(v), { message: 'Use an https address.' })
  .refine(
    (v) => {
      try {
        const u = new URL(v);
        return u.username === '' && u.password === '' && u.hostname.includes('.');
      } catch {
        return false;
      }
    },
    { message: 'The address is not valid.' },
  );

/* ---------- inputs ---------- */

export const accountInput = z
  .object({
    provider: z.enum(SOCIAL_PROVIDERS),
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine(noAngle, { message: 'Angle brackets are not allowed.' }),
    externalId: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z_.-]{1,60}$/, 'Use the id the network shows.'),
    accessToken: z
      .string()
      .trim()
      .min(20)
      .max(1000)
      .regex(/^\S+$/, 'It must not contain spaces.')
      .optional(),
    tokenExpiresInDays: z.number().int().min(1).max(365).nullable().default(null),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.provider !== 'sandbox' && v.accessToken === undefined)
      ctx.addIssue({ code: 'custom', path: ['accessToken'], message: 'Paste the access token.' });
    if (v.provider === 'sandbox' && v.accessToken !== undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['accessToken'],
        message: 'A sandbox account has no token.',
      });
  });

export const accountUpdate = z
  .object({
    version: z.number().int().min(1),
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine(noAngle, { message: 'Angle brackets are not allowed.' })
      .optional(),
    accessToken: z.string().trim().min(20).max(1000).regex(/^\S+$/).optional(),
    tokenExpiresInDays: z.number().int().min(1).max(365).nullable().optional(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .strict();

const bodyText = z
  .string()
  .max(POST_BODY_MAX)
  .refine(noAngle, { message: 'Angle brackets are not allowed.' });

export const postInput = z
  .object({
    accountId: z.string().uuid(),
    body: bodyText.default(''),
    linkUrl: httpsUrl.nullable().default(null),
    imageUrl: httpsUrl.nullable().default(null),
    hashtagGroupId: z.string().uuid().nullable().default(null),
    scheduledAt: z.string().datetime({ offset: true }).nullable().default(null),
  })
  .strict()
  .refine((v) => v.body.trim() !== '' || v.imageUrl !== null, {
    message: 'Write some text or add an image.',
    path: ['body'],
  });

export const postUpdate = z
  .object({
    version: z.number().int().min(1),
    body: bodyText.optional(),
    linkUrl: httpsUrl.nullable().optional(),
    imageUrl: httpsUrl.nullable().optional(),
    scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  })
  .strict();

export const hashtagGroupInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine(noAngle, { message: 'Angle brackets are not allowed.' }),
    tags: z
      .array(
        z
          .string()
          .trim()
          .regex(/^#?[\p{L}\p{N}_]{1,50}$/u, 'Use letters, digits and underscores.'),
      )
      .min(1)
      .max(MAX_TAGS_PER_GROUP),
  })
  .strict();

/* ---------- counting ---------- */

const HASHTAG = /(?:^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]+)/gu;
const MENTION = /(?:^|[^\p{L}\p{N}_.])@([\p{L}\p{N}_][\p{L}\p{N}_.]*)/gu;

export const countHashtags = (text: string): number => [...text.matchAll(HASHTAG)].length;
export const countMentions = (text: string): number => [...text.matchAll(MENTION)].length;

/** Characters as people see them (code points). */
export const charCount = (text: string): number => [...text].length;

const EMOJI = /\p{Extended_Pictographic}/u;
/** Threads counts an emoji as the number of UTF-8 bytes it takes; every other character counts as one. */
export function threadsLength(text: string): number {
  let n = 0;
  for (const ch of text) n += EMOJI.test(ch) ? new TextEncoder().encode(ch).length : 1;
  return n;
}

export const normaliseTag = (tag: string): string => `#${tag.trim().replace(/^#/, '')}`;

/** The text with a hashtag group added on a new line (tags already in the text are not added again). */
export function withHashtags(body: string, tags: readonly string[]): string {
  const present = new Set([...body.matchAll(HASHTAG)].map((m) => (m[1] ?? '').toLowerCase()));
  const extra = tags.map(normaliseTag).filter((t) => !present.has(t.slice(1).toLowerCase()));
  if (extra.length === 0) return body;
  return body.trim() === '' ? extra.join(' ') : `${body.trimEnd()}\n\n${extra.join(' ')}`;
}

/* ---------- network rules ---------- */

export interface PostContent {
  body: string;
  linkUrl: string | null;
  imageUrl: string | null;
}

/** What is wrong with a post for a network (empty when it can be sent). */
export function problemsFor(provider: SocialProvider, post: PostContent): string[] {
  const out: string[] = [];
  if (provider === 'instagram') {
    if (post.imageUrl === null) out.push('Instagram needs an image.');
    else if (!/\.(jpe?g)(\?.*)?$/i.test(post.imageUrl))
      out.push('Instagram accepts JPEG images only. The address should end in .jpg or .jpeg.');
    if (charCount(post.body) > INSTAGRAM_CAPTION_MAX)
      out.push(`An Instagram caption can have ${INSTAGRAM_CAPTION_MAX} characters at most.`);
    if (countHashtags(post.body) > INSTAGRAM_HASHTAGS_MAX)
      out.push(`An Instagram caption can have ${INSTAGRAM_HASHTAGS_MAX} hashtags at most.`);
    if (countMentions(post.body) > INSTAGRAM_MENTIONS_MAX)
      out.push(`An Instagram caption can have ${INSTAGRAM_MENTIONS_MAX} mentions at most.`);
    if (post.linkUrl !== null)
      out.push('Instagram does not show a link on a post. Put the address in the text.');
  } else if (provider === 'threads') {
    if (threadsLength(post.body) > THREADS_TEXT_MAX)
      out.push(
        `A Threads post can have ${THREADS_TEXT_MAX} characters at most (an emoji counts as its UTF-8 bytes).`,
      );
    if (post.body.trim() === '' && post.imageUrl === null)
      out.push('A Threads post needs text or an image.');
    if (post.linkUrl !== null) out.push('Put the link in the text of a Threads post.');
  } else if (provider === 'facebook') {
    if (post.body.trim() === '' && post.imageUrl === null && post.linkUrl === null)
      out.push('Write some text, add an image or a link.');
    if (post.imageUrl !== null && post.linkUrl !== null)
      out.push('A Facebook post has either an image or a link, not both.');
  } else if (post.body.trim() === '' && post.imageUrl === null)
    out.push('Write some text or add an image.');
  return out;
}

/** The topic tag of a Threads post taken from the first hashtag of the text, if it fits Threads' rules. */
export function threadsTopicTag(body: string): string | null {
  const m = [...body.matchAll(HASHTAG)][0];
  const tag = m?.[1];
  if (tag === undefined || tag.length > THREADS_TOPIC_TAG_MAX) return null;
  return /[.&]/.test(tag) ? null : tag;
}

/* ---------- limits ---------- */

export const dailyLimitOf = (provider: SocialProvider): number | null =>
  DAILY_POST_LIMITS[provider];

/** May another post be published now, given how many were published in the last 24 hours? */
export function withinDailyLimit(provider: SocialProvider, publishedLast24h: number): boolean {
  const limit = dailyLimitOf(provider);
  return limit === null || publishedLast24h < limit;
}

/** Is a long-lived token about to expire (within the number of days)? */
export function tokenExpiresSoon(expiresAt: string | null, now: Date, days: number): boolean {
  return expiresAt !== null && Date.parse(expiresAt) - now.getTime() < days * 86_400_000;
}

/** The permalink Facebook documents for a Page post. */
export const facebookPostUrl = (postId: string): string => `https://www.facebook.com/${postId}`;
