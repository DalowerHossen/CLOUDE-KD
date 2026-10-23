// path: lib/whatsapp/client.ts
// The Graph API calls of the WhatsApp Cloud API: send a message, create, list and delete templates, and read the phone numbers
// of the account (the health check). The address is fixed to graph.facebook.com. The access token goes only in the
// Authorization header and is never part of an error text or a log. Calls have a time limit.
import 'server-only';
import {
  WHATSAPP_API_VERSION,
  WHATSAPP_GRAPH_URL,
  WHATSAPP_TEMPLATE_LIST_MAX_PAGES,
  WHATSAPP_TEMPLATE_LIST_PAGE,
  WHATSAPP_TIMEOUT_MS,
} from '@/config/s16-whatsapp';
import { failureText, parseGraphError } from './rules';

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'WhatsAppApiError';
  }
}

export interface Credentials {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const defaultFetch: Fetcher = (url, init) => fetch(url, init);

async function call(
  creds: Credentials,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body: unknown,
  fetcher: Fetcher,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(`${WHATSAPP_GRAPH_URL}/${WHATSAPP_API_VERSION}/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${creds.accessToken}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(WHATSAPP_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    throw new WhatsAppApiError('WhatsApp could not be reached. Try again.', null, 0);
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const e = parseGraphError(json);
    throw new WhatsAppApiError(
      failureText(e.code, e.details || e.message),
      e.code,
      response.status,
    );
  }
  return json;
}

const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** Sends a message. The answer means "accepted"; delivery comes later by webhook. */
export async function sendMessage(
  creds: Credentials,
  payload: Record<string, unknown>,
  fetcher: Fetcher = defaultFetch,
): Promise<{ messageId: string; waId: string }> {
  const json = obj(await call(creds, 'POST', `${creds.phoneNumberId}/messages`, payload, fetcher));
  const first = obj(Array.isArray(json.messages) ? json.messages[0] : null);
  const contact = obj(Array.isArray(json.contacts) ? json.contacts[0] : null);
  const messageId = typeof first.id === 'string' ? first.id : '';
  if (messageId === '')
    throw new WhatsAppApiError('WhatsApp did not return a message id.', null, 200);
  return { messageId, waId: typeof contact.wa_id === 'string' ? contact.wa_id : '' };
}

export async function createTemplate(
  creds: Credentials,
  body: Record<string, unknown>,
  fetcher: Fetcher = defaultFetch,
): Promise<{ id: string; status: string; category: string }> {
  const json = obj(await call(creds, 'POST', `${creds.wabaId}/message_templates`, body, fetcher));
  return {
    id: typeof json.id === 'string' ? json.id : '',
    status: typeof json.status === 'string' ? json.status : 'PENDING',
    category: typeof json.category === 'string' ? json.category : '',
  };
}

export interface RemoteTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  parameterFormat: string;
  components: unknown[];
}

/** All templates of the account with the default fields (name, language, category, status, parameter format, components, id), paged with the cursors of the answer, at most 20 pages. */
export async function listTemplates(
  creds: Credentials,
  fetcher: Fetcher = defaultFetch,
): Promise<RemoteTemplate[]> {
  const out: RemoteTemplate[] = [];
  let after: string | null = null;
  for (let page = 0; page < WHATSAPP_TEMPLATE_LIST_MAX_PAGES; page += 1) {
    const query: string = `limit=${WHATSAPP_TEMPLATE_LIST_PAGE}${after ? `&after=${encodeURIComponent(after)}` : ''}`;
    const json = obj(
      await call(creds, 'GET', `${creds.wabaId}/message_templates?${query}`, undefined, fetcher),
    );
    for (const raw of Array.isArray(json.data) ? json.data : []) {
      const t = obj(raw);
      if (typeof t.name !== 'string' || typeof t.language !== 'string') continue;
      out.push({
        id: typeof t.id === 'string' ? t.id : '',
        name: t.name,
        language: t.language,
        category: typeof t.category === 'string' ? t.category.toLowerCase() : 'utility',
        status: typeof t.status === 'string' ? t.status : 'PENDING',
        parameterFormat:
          String(t.parameter_format ?? 'positional').toLowerCase() === 'named'
            ? 'named'
            : 'positional',
        components: Array.isArray(t.components) ? t.components : [],
      });
    }
    const cursors = obj(obj(json.paging).cursors);
    const next = obj(json.paging).next;
    after = typeof next === 'string' && typeof cursors.after === 'string' ? cursors.after : null;
    if (after === null) break;
  }
  return out;
}

export async function deleteTemplate(
  creds: Credentials,
  name: string,
  metaTemplateId: string | null,
  fetcher: Fetcher = defaultFetch,
): Promise<void> {
  // With the template id only that template (one language) is deleted; with the name alone every language of the name goes.
  const id = metaTemplateId ? `&hsm_id=${encodeURIComponent(metaTemplateId)}` : '';
  await call(
    creds,
    'DELETE',
    `${creds.wabaId}/message_templates?name=${encodeURIComponent(name)}${id}`,
    undefined,
    fetcher,
  );
}

export interface PhoneHealth {
  found: boolean;
  verifiedName: string;
  displayPhone: string;
  quality: 'GREEN' | 'YELLOW' | 'RED' | 'NA';
}

/** Lists the phone numbers of the account and finds ours: proves that the token, the account id and the number id belong together. */
export async function phoneHealth(
  creds: Credentials,
  fetcher: Fetcher = defaultFetch,
): Promise<PhoneHealth> {
  const json = obj(await call(creds, 'GET', `${creds.wabaId}/phone_numbers`, undefined, fetcher));
  for (const raw of Array.isArray(json.data) ? json.data : []) {
    const p = obj(raw);
    if (p.id === creds.phoneNumberId) {
      const q = typeof p.quality_rating === 'string' ? p.quality_rating.toUpperCase() : 'NA';
      return {
        found: true,
        verifiedName: typeof p.verified_name === 'string' ? p.verified_name.slice(0, 200) : '',
        displayPhone:
          typeof p.display_phone_number === 'string' ? p.display_phone_number.slice(0, 40) : '',
        quality: q === 'GREEN' || q === 'YELLOW' || q === 'RED' ? q : 'NA',
      };
    }
  }
  return { found: false, verifiedName: '', displayPhone: '', quality: 'NA' };
}

/** The messaging limit text of the phone number (for example "TIER_250"), read with the field named in the messaging limits page. */
export async function messagingLimit(
  creds: Credentials,
  fetcher: Fetcher = defaultFetch,
): Promise<string | null> {
  const json = obj(
    await call(
      creds,
      'GET',
      `${creds.phoneNumberId}?fields=whatsapp_business_manager_messaging_limit`,
      undefined,
      fetcher,
    ),
  );
  const v = json.whatsapp_business_manager_messaging_limit;
  return typeof v === 'string' ? v : null;
}
