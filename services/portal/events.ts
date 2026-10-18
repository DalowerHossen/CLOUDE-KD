// path: services/portal/events.ts
// What a client did on a token page. The record keeps the masked address, the keyed hash of the address, the full address
// encrypted for evidence packs, the browser string and a device label. Nothing from card fields is ever passed in here.
import 'server-only';
import { headers } from 'next/headers';
import { getClientIp } from '@/lib/api/client-ip';
import { getService } from '@/lib/container';
import { createLogger } from '@/lib/logger';
import { describeDevice } from '@/services/portal/device';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { hashIp } from '@/services/audit/request-meta';
import { maskIp } from '@/services/audit/mask-ip';
import type { TokenDocumentType } from '@/types/contracts';

const log = createLogger({ component: 'portal-events' });

export type PortalEventName =
  'view' | 'code_passed' | 'pdf_download' | 'print' | 'rerequest' | 'consent' | 'refund_request';

export interface PortalSubject {
  tokenId: string;
  companyId: string;
  docType: TokenDocumentType;
  docId: string;
}

/** Stores one event. A failure to store never breaks the page (it is logged without the address). */
export async function recordPortalEvent(
  subject: PortalSubject,
  event: PortalEventName,
): Promise<void> {
  try {
    const source = await headers();
    const ip = getClientIp(source);
    const known = ip !== '0.0.0.0';
    const userAgent = source.get('user-agent')?.slice(0, 300) ?? null;
    const encrypted = known
      ? await getService('encryption').encrypt('pii', ip, subject.companyId)
      : null;
    const { error } = await getAdminSupabase()
      .from('portal_events')
      .insert({
        company_id: subject.companyId,
        token_id: subject.tokenId,
        doc_type: subject.docType,
        doc_id: subject.docId,
        event,
        ip_masked: known ? maskIp(ip) : null,
        ip_hash: known ? await hashIp(ip) : null,
        ip_enc: encrypted,
        user_agent: userAgent,
        device: describeDevice(userAgent),
      });
    if (error) log.error('portal event not stored', { event });
  } catch {
    log.error('portal event not stored', { event });
  }
}
