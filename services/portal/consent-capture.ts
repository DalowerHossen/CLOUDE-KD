// path: services/portal/consent-capture.ts
// The payer accepts the terms and the refund policy before the payment form opens. The record keeps the time, the address
// (masked, hashed and encrypted), the device, the version of the wording and the exact text that was shown, with its
// hash. The consent contract (STEP 02) also gets the two purposes, so the platform-wide consent log stays complete.
import 'server-only';
import { CLIENT_CONSENT_VERSION } from '@/config/s13-portal';
import { REFUND_WINDOW_DAYS } from '@/config/payment-risk';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { sha256Hex } from '@/lib/utils/hash';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { captureEvidence, recordPortalEvent, type PortalSubject } from './events';

/** The exact words the payer agrees to. */
export function consentText(): string {
  return t('s13Portal.consent.text', { days: String(REFUND_WINDOW_DAYS) });
}

export async function captureConsent(
  subject: PortalSubject,
): Promise<{ id: string; textHash: string }> {
  const text = consentText();
  const textHash = await sha256Hex(text);
  const { data, error } = await getAdminSupabase()
    .from('consent_records')
    .insert({
      company_id: subject.companyId,
      token_id: subject.tokenId,
      doc_type: subject.docType,
      doc_id: subject.docId,
      terms_version: CLIENT_CONSENT_VERSION,
      text_snapshot: text,
      text_hash: textHash,
      ...(await captureEvidence(subject.companyId)),
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  const who = `portal:${subject.tokenId}`;
  const consent = getService('consent');
  await consent.record({ subject: who, purpose: 'terms', version: CLIENT_CONSENT_VERSION, text });
  await consent.record({
    subject: who,
    purpose: 'refund_policy',
    version: CLIENT_CONSENT_VERSION,
    text,
  });
  await recordPortalEvent(subject, 'consent');
  return { id: String(data.id), textHash };
}
