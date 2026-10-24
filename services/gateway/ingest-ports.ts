// path: services/gateway/ingest-ports.ts
// The real ports of the ingest pipeline: keys from the database, the minute counter of the key, the sub-merchant by reference and
// the posting of the entries.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { rateState, windowStart } from '@/lib/integrations/api-key-rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { postBatch } from './entries';
import type { IngestPorts } from './ingest';
import { authenticateIngestKey, markIngestKeyUsed } from './ingest-keys';

export function makeIngestPorts(): IngestPorts {
  return {
    now: () => new Date(),
    authenticate: authenticateIngestKey,
    failedAttempt: async (ip) => {
      const r = await getService('security').rateLimit(`settlement-ingest-auth:${ip}`, 'strict');
      return { allowed: r.allowed, retryAfterSeconds: r.retryAfterSeconds };
    },
    hit: async (auth, now) => {
      const { data, error } = await getAdminSupabase().rpc('kd_settlement_ingest_hit', {
        p_key: auth.keyId,
        p_company: auth.companyId,
        p_window: windowStart(now),
      });
      if (error) throw new InternalError(error);
      const state = rateState(Number(data), auth.rateLimitPerMinute, now);
      return { allowed: state.allowed, retryAfterSeconds: state.retryAfterSeconds };
    },
    findSubMerchant: async (companyId, reference) => {
      const { data, error } = await getAdminSupabase()
        .from('sub_merchants')
        .select('id, status')
        .eq('company_id', companyId)
        .eq('reference', reference)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw new InternalError(error);
      if (!data) return null;
      const status = String(data.status);
      return {
        id: String(data.id),
        status: status === 'closed' ? 'closed' : status === 'suspended' ? 'suspended' : 'active',
      };
    },
    post: (auth, subMerchantId, entries) =>
      postBatch(
        {
          companyId: auth.companyId,
          createdBy: null,
          via: { kind: 'ingest_key', keyId: auth.keyId },
        },
        subMerchantId,
        entries,
      ),
    markUsed: markIngestKeyUsed,
    securityEvent: async (kind, data) => {
      await getService('security').raiseSecurityEvent(
        kind === 'token_abuse' ? 'token_abuse' : 'other',
        data,
      );
    },
  };
}
