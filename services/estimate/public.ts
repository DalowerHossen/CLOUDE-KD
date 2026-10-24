// path: services/estimate/public.ts
// What the client's estimate page (STEP 13, "/e/<token>") needs: read the estimate through its link, and accept or
// decline it. The decision stores a signature record: typed name, time, network address, browser and a checksum of
// the content that was agreed to. A link of another document type or an expired link never works here.
import 'server-only';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { estimateDecisionSchema, type EstimateDecision } from '@/lib/estimate/input';
import { isDecidable } from '@/lib/estimate/status';
import { sha256Hex } from '@/lib/utils/hash';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getEstimate, logEstimateEvent, type EstimateView } from './estimates';

async function resolve(token: string): Promise<{ estimate: EstimateView; companyId: string }> {
  const v = await getService('tokens').verify(token);
  if (!v.valid || v.docType !== 'estimate') throw new NotFoundError();
  if (v.otpRequired) throw new ForbiddenError();
  const estimate = await getEstimate(v.companyId, v.docId);
  return { estimate, companyId: v.companyId };
}

export interface PublicEstimate {
  id: string;
  number: string;
  status: EstimateView['status'];
  seller: Record<string, unknown> | null;
  clientName: string;
  validUntil: string;
  total: string;
  taxTotal: string;
  subtotal: string;
  notes: string;
  lines: { description: string; quantity: string; unit: string; unitPrice: string }[];
  canDecide: boolean;
  decidedAt: string | null;
  signerName: string;
}

/** The estimate for the client page; the first look also marks it as viewed. */
export async function getEstimateByToken(token: string): Promise<PublicEstimate> {
  const { estimate, companyId } = await resolve(token);
  if (estimate.status === 'draft' || estimate.status === 'void') throw new NotFoundError();
  if (estimate.status === 'sent') {
    const r = await getAdminSupabase()
      .from('estimates')
      .update({ status: 'viewed', viewed_at: new Date().toISOString() })
      .eq('id', estimate.id)
      .eq('company_id', companyId)
      .eq('status', 'sent')
      .select('id');
    if (!r.error && r.data && r.data.length > 0)
      await logEstimateEvent(
        companyId,
        estimate.id,
        'viewed',
        'The client opened the estimate',
        null,
      );
  }
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: estimate.id,
    number: estimate.number ?? '',
    status: estimate.status === 'sent' ? 'viewed' : estimate.status,
    seller: estimate.seller,
    clientName: estimate.clientName,
    validUntil: estimate.validUntil,
    total: estimate.total,
    taxTotal: estimate.taxTotal,
    subtotal: estimate.subtotal,
    notes: estimate.input.notes,
    lines: estimate.input.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
    })),
    canDecide:
      isDecidable(estimate.status === 'sent' ? 'viewed' : estimate.status) &&
      estimate.validUntil >= today,
    decidedAt: estimate.decidedAt,
    signerName: estimate.signerName,
  };
}

/**
 * The client accepts or declines. `network` is the address and browser of the request, taken by the caller from the
 * request headers. Deciding twice, or after the date, is refused.
 */
export async function decideEstimate(
  token: string,
  input: EstimateDecision,
  network: { ip: string; agent: string },
): Promise<{ status: 'accepted' | 'declined' }> {
  const body = estimateDecisionSchema.safeParse(input);
  if (!body.success) throw new ValidationError('Check your answer and try again.');
  const { estimate, companyId } = await resolve(token);
  const decidedAt = new Date().toISOString();
  const content = sha256Hex(
    JSON.stringify({ number: estimate.number, input: estimate.input, total: estimate.total }),
  );
  const hash = sha256Hex(
    [estimate.id, content, body.data.decision, body.data.signerName, decidedAt, network.ip].join(
      '|',
    ),
  );
  const { data, error } = await getAdminSupabase().rpc('kd_estimate_decide', {
    p_estimate: estimate.id,
    p_decision: body.data.decision,
    p_name: body.data.signerName,
    p_ip: network.ip.slice(0, 64),
    p_agent: network.agent.slice(0, 300),
    p_note: body.data.note,
    p_hash: hash,
  });
  if (error) {
    if (error.code === '22023')
      throw new ValidationError('This estimate can no longer be accepted or declined.');
    throw new InternalError(error);
  }
  const status = data === 'accepted' ? 'accepted' : 'declined';
  await logEstimateEvent(
    companyId,
    estimate.id,
    status,
    `${body.data.signerName} ${status} the estimate`,
    null,
  );
  await getService('events').publish({
    name: status === 'accepted' ? 'estimate.approved' : 'estimate.rejected',
    companyId,
    payload: {
      estimateId: estimate.id,
      number: estimate.number,
      clientName: estimate.clientName,
      total: estimate.total,
    },
  });
  await getService('audit').record({
    action: `estimate.${status}`,
    resourceType: 'estimate',
    resourceId: estimate.id,
    companyId,
    metadata: { signer: body.data.signerName, signatureHash: hash },
  });
  return { status };
}
