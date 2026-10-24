// path: services/portal/client-mail.ts
// The one way the platform sends a message to a client of a company. It sends through the e-mail contract (STEP 05) and
// then writes a delivery proof: the outbox row, the document, the masked address (the full address encrypted for evidence
// packs), the subject and a hash of the body. A failure to write the proof is logged and never hides the send itself.
import 'server-only';
import { getService } from '@/lib/container';
import { maskEmail } from '@/lib/encryption/redact';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sha256Hex } from '@/lib/utils/hash';
import type { Uuid } from '@/types/contracts';

const log = createLogger({ component: 'client-mail' });

export const PROOF_DOC_TYPES = [
  'invoice',
  'estimate',
  'receipt',
  'hub',
  'contract',
  'payment',
  'statement',
  'credit_note',
  'other',
] as const;
export type ProofDocType = (typeof PROOF_DOC_TYPES)[number];

export interface ClientMailInput {
  companyId: Uuid;
  /** Template id, for example "client.receipt" or "invoice.sent". */
  template: string;
  to: string;
  data: Record<string, unknown>;
  /** Makes a retry send once only. */
  idempotencyKey: string;
  doc: { type: ProofDocType; id: Uuid | null };
  clientId?: Uuid | null;
  /** The portal link carried by the message, when there is one. */
  tokenId?: Uuid | null;
  sentBy?: Uuid | null;
}

/** Sends the message and records the proof. Returns the outbox id, or null when it could not be found. */
export async function sendClientMail(input: ClientMailInput): Promise<string | null> {
  const to = input.to.trim().toLowerCase();
  await getService('email').send({
    template: input.template,
    to,
    data: input.data,
    companyId: input.companyId,
    idempotencyKey: input.idempotencyKey,
  });
  try {
    const admin = getAdminSupabase();
    const { data: row, error } = await admin
      .from('email_outbox')
      .select('id, subject, body_html')
      .eq('company_id', input.companyId)
      .eq('idempotency_key', input.idempotencyKey)
      .maybeSingle();
    if (error || !row) {
      log.error('delivery proof not written: message not found', { template: input.template });
      return null;
    }
    const encrypted = await getService('encryption').encrypt('pii', to, input.companyId);
    const saved = await admin.from('delivery_proofs').upsert(
      {
        company_id: input.companyId,
        outbox_id: row.id,
        template: input.template,
        doc_type: input.doc.type,
        doc_id: input.doc.id,
        client_id: input.clientId ?? null,
        token_id: input.tokenId ?? null,
        to_masked: maskEmail(to),
        to_enc: encrypted as unknown as Record<string, unknown>,
        subject: String(row.subject),
        content_hash: await sha256Hex(String(row.body_html)),
        sent_by: input.sentBy ?? null,
      },
      { onConflict: 'outbox_id', ignoreDuplicates: true },
    );
    if (saved.error) log.error('delivery proof not written', { template: input.template });
    return String(row.id);
  } catch {
    log.error('delivery proof not written', { template: input.template });
    return null;
  }
}
