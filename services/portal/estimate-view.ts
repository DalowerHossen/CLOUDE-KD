// path: services/portal/estimate-view.ts
// The client's estimate page and decision. The STEP 09 estimate service does the work (it reads the estimate by its link
// and stores the signature record); this file adds the portal rules: only an estimate link, the address and browser of
// the request, and one answer for every case that must look like an unavailable link. A link that needs a code is refused
// by that service (request R3), so it shows as unavailable until the service accepts the portal's code session.
import 'server-only';
import { headers } from 'next/headers';
import { getClientIp } from '@/lib/api/client-ip';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { renderEstimatePdf } from '@/services/estimate/pdf';
import {
  decideEstimate,
  getEstimateByToken,
  type PublicEstimate,
} from '@/services/estimate/public';
import type { PortalSubject } from './events';

async function unavailableOnForbidden<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (thrown) {
    if (thrown instanceof ForbiddenError) throw new NotFoundError();
    throw thrown;
  }
}

export function getPortalEstimate(token: string): Promise<PublicEstimate> {
  return unavailableOnForbidden(() => getEstimateByToken(token));
}

export async function decidePortalEstimate(
  token: string,
  input: { decision: 'accepted' | 'declined'; signerName: string; note: string; agree: boolean },
): Promise<{ status: 'accepted' | 'declined' }> {
  const source = await headers();
  const network = {
    ip: getClientIp(source),
    agent: source.get('user-agent')?.slice(0, 300) ?? '',
  };
  return unavailableOnForbidden(() => decideEstimate(token, input, network));
}

/** The estimate PDF: drawn from the stored estimate, never for a draft or a void one. */
export async function getPortalEstimatePdf(
  subject: PortalSubject,
  token: string,
): Promise<{ bytes: Uint8Array; name: string }> {
  const estimate = await getPortalEstimate(token);
  if (estimate.id !== subject.docId) throw new NotFoundError();
  const bytes = await renderEstimatePdf(subject.companyId, subject.docId);
  return { bytes, name: `estimate-${estimate.number || 'document'}.pdf` };
}
