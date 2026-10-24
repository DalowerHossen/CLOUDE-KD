// path: services/approval/delegation.ts
// Delegation of approval rights for a period. The row is written with the caller's own client (RLS enforces the owner).
import 'server-only';
import { z } from 'zod';
import { getService } from '@/lib/container';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Actor } from '@/types/contracts';

export const delegationSchema = z
  .object({
    delegateId: z.string().uuid(),
    endsAt: z.string().datetime({ offset: true }),
  })
  .strict();

const MAX_DAYS = 30;

export async function createDelegation(
  actor: Actor,
  input: z.infer<typeof delegationSchema>,
): Promise<string> {
  if (actor.role !== 'owner' && actor.role !== 'ceo' && actor.role !== 'super_admin')
    throw new ForbiddenError();
  if (input.delegateId === actor.userId)
    throw new ValidationError('You cannot delegate to yourself.');
  const ends = new Date(input.endsAt);
  const now = new Date();
  if (ends <= now) throw new ValidationError('The end time must be in the future.');
  if (ends.getTime() - now.getTime() > MAX_DAYS * 86_400_000) {
    throw new ValidationError(`A delegation can last at most ${MAX_DAYS} days.`);
  }
  const { data, error } = await (
    await createServerSupabase()
  )
    .from('approval_delegations')
    .insert({
      company_id: actor.companyId,
      delegator_id: actor.userId,
      delegator_role: actor.role,
      delegate_id: input.delegateId,
      ends_at: ends.toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  const id = z.string().uuid().parse(data.id);
  await getService('audit').record({
    action: 'approval.delegated',
    resourceType: 'approval_delegation',
    resourceId: id,
    metadata: { delegate_id: input.delegateId, ends_at: ends.toISOString() },
  });
  return id;
}

export async function revokeDelegation(actor: Actor, id: string): Promise<void> {
  const client = await createServerSupabase();
  const { data, error } = await client
    .from('approval_delegations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('delegator_id', actor.userId)
    .is('revoked_at', null)
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'approval.delegation_revoked',
    resourceType: 'approval_delegation',
    resourceId: id,
  });
}
