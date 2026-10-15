// path: services/compliance/consent-service.ts
// Implements the consent contract. Rows store a keyed hash of the subject and a hash of the consent text.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { getContext } from '@/lib/logger/correlation';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sha256Hex } from '@/lib/utils/hash';
import type { ConsentService } from '@/types/contracts';
import { subjectHash } from './subject';

export function createConsentService(): ConsentService {
  return {
    async record(input) {
      const { error } = await getAdminSupabase()
        .from('consent_records_platform')
        .insert({
          company_id: getContext()?.companyId ?? null,
          subject_hash: await subjectHash(input.subject),
          purpose: input.purpose,
          policy_version: input.version,
          text_hash: await sha256Hex(input.text),
          granted: true,
        });
      if (error) throw new InternalError(error);
    },
    async has(subject, purpose) {
      const { data, error } = await getAdminSupabase()
        .from('consent_records_platform')
        .select('granted, withdrawn_at')
        .eq('subject_hash', await subjectHash(subject))
        .eq('purpose', purpose)
        .is('deleted_at', null)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new InternalError(error);
      return data !== null && data.granted === true && data.withdrawn_at === null;
    },
    async withdraw(subject, purpose) {
      const { error } = await getAdminSupabase()
        .from('consent_records_platform')
        .update({ withdrawn_at: new Date().toISOString() })
        .eq('subject_hash', await subjectHash(subject))
        .eq('purpose', purpose)
        .is('withdrawn_at', null)
        .is('deleted_at', null);
      if (error) throw new InternalError(error);
    },
  };
}
