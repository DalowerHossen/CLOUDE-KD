// path: app/api/contracts/[id]/signed/route.ts
// The signed PDF of a contract, for people of the company who may read contracts. A plain handler because the answer is
// the file; it reads only a contract of the session's own company.
import { getService } from '@/lib/container';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  errorResponse,
  normalizeError,
} from '@/lib/errors';
import { resolveCorrelationId } from '@/lib/logger/correlation';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { getContract } from '@/services/contract/contracts';
import { assertApiModuleEnabled } from '@/services/company/module-access';

export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const correlationId = resolveCorrelationId(request.headers.get('x-correlation-id'));
  try {
    const { id } = await context.params;
    if (!UUID.test(id)) throw new NotFoundError();
    const actor = await getService('auth').getActor();
    if (!actor) throw new UnauthorizedError();
    await assertApiModuleEnabled(new URL(request.url).pathname, actor.companyId);
    if (!actor.companyId) throw new NotFoundError();
    if (!(await getService('permissions').can(actor, 'contract.read', { type: 'contract' })))
      throw new ForbiddenError();
    const contract = await getContract(actor.companyId, id);
    const { data } = await getAdminSupabase()
      .from('contracts')
      .select('archived_file_id')
      .eq('id', id)
      .eq('company_id', actor.companyId)
      .maybeSingle();
    if (contract.status !== 'signed' || !data?.archived_file_id) throw new NotFoundError();
    const file = await getService('storage').get(String(data.archived_file_id));
    if (file.record.companyId !== actor.companyId) throw new NotFoundError();
    return new Response(Buffer.from(file.bytes), {
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(file.bytes.length),
        'content-disposition': `attachment; filename="${contract.number}-signed.pdf"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
    });
  } catch (thrown) {
    return errorResponse(normalizeError(thrown), correlationId);
  }
}
