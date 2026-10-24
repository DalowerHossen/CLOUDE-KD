// path: services/portal/rerequest.ts
// A client whose link expired asks for a new one. The answer is always the same ("the request was sent"), so the form
// cannot be used to test links. Only an expired link of this platform creates a request; one request waits per link; the
// owner is told, and decides in the owner workflow (STEP 13.7). The new link always goes to the client's address on file,
// never to an address typed here.
import 'server-only';
import { getService } from '@/lib/container';
import { hashToken } from '@/lib/auth/tokens';
import { getServerEnv } from '@/lib/env';
import { InternalError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { readRequestMeta } from '@/services/audit/request-meta';
import { hasValidSignature } from '@/lib/auth/tokens';
import { recordPortalEvent } from './events';
import { z } from 'zod';

const lookupSchema = z
  .object({
    id: z.string().uuid(),
    company_id: z.string().uuid(),
    doc_type: z.enum(['invoice', 'estimate', 'receipt', 'hub', 'contract', 'payslip', 'payment']),
    doc_id: z.string().uuid(),
    expires_at: z.string(),
    revoked_at: z.string().nullable(),
  })
  .strip();

export async function requestNewLink(token: string): Promise<void> {
  const security = getService('security');
  const meta = await readRequestMeta();
  const limit = await security.rateLimit(`portal:rerequest:${meta.ipHash ?? 'unknown'}`, 'strict');
  if (!limit.allowed) return;
  if (!(await hasValidSignature(token, getServerEnv().HMAC_TOKEN_SECRET))) return;
  const db = getAdminSupabase();
  const { data, error } = await db.rpc('kd_portal_token_lookup', {
    p_hash: await hashToken(token),
  });
  if (error) throw new InternalError(error);
  const rows = Array.isArray(data) ? data : [];
  const first: unknown = rows[0];
  if (!first) return;
  const row = lookupSchema.parse(first);
  // Only an expired, not revoked link can be asked for again.
  if (row.revoked_at !== null || Date.parse(row.expires_at) > Date.now()) return;
  const created = await db
    .from('link_requests')
    .insert({
      company_id: row.company_id,
      token_id: row.id,
      doc_type: row.doc_type,
      doc_id: row.doc_id,
      ip_hash: meta.ipHash,
    })
    .select('id')
    .single();
  if (created.error) {
    if (created.error.code === '23505') return; // a request is already waiting
    throw new InternalError(created.error);
  }
  await recordPortalEvent(
    { tokenId: row.id, companyId: row.company_id, docType: row.doc_type, docId: row.doc_id },
    'rerequest',
  );
  await getService('audit').record({
    action: 'portal.link_requested',
    resourceType: 'link_request',
    resourceId: String(created.data.id),
    companyId: row.company_id,
    metadata: { doc_type: row.doc_type },
  });
  await getService('notification').notify({
    companyId: row.company_id,
    type: 'portal.link_request',
    title: 'A client asked for a new link',
    body: 'A client opened an expired link and asked for a new one. Review the request to approve or deny it.',
    href: '/client-mail/link-requests',
  });
}
