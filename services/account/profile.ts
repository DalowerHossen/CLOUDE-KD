// path: services/account/profile.ts
// Reads and saves the personal profile of the signed-in person. A save needs the version that the person read.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError } from '@/lib/errors';
import { profileInput, type OwnProfile } from '@/lib/profile/schema';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';

export async function getOwnProfile(actor: Actor): Promise<OwnProfile> {
  const { data, error } = await getAdminSupabase()
    .from('profiles')
    .select('id, full_name, email, timezone, version')
    .eq('user_id', actor.userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return {
    fullName: String(data.full_name ?? ''),
    email: String(data.email ?? actor.email),
    timezone: String(data.timezone ?? 'UTC'),
    version: Number(data.version),
  };
}

export async function saveOwnProfile(actor: Actor, input: unknown): Promise<OwnProfile> {
  const parsed = profileInput.parse(input);
  const { data, error } = await getAdminSupabase()
    .from('profiles')
    .update({
      full_name: parsed.fullName,
      timezone: parsed.timezone,
      version: parsed.expectedVersion + 1,
    })
    .eq('user_id', actor.userId)
    .eq('version', parsed.expectedVersion)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data)
    throw new ConflictError('Your profile was changed elsewhere. Reload the page and try again.');
  await getService('audit').record({
    action: 'account.profile_saved',
    resourceType: 'profile',
    resourceId: String(data.id),
    metadata: { fields: ['full_name', 'timezone'] },
  });
  return getOwnProfile(actor);
}
