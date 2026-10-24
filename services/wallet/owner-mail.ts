// path: services/wallet/owner-mail.ts
// Sends a billing message to the active owners of a company. A failure is logged and never stops the money step that
// asked for the message.
import 'server-only';
import { getService } from '@/lib/container';
import { siteUrl } from '@/lib/cms/site-url';
import { createLogger } from '@/lib/logger';
import { getAdminSupabase } from '@/lib/supabase/admin';

const log = createLogger({ component: 'owner-mail' });

export async function ownerEmails(companyId: string): Promise<string[]> {
  const admin = getAdminSupabase();
  const owners = await admin
    .from('memberships')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .is('deleted_at', null);
  if (owners.error) throw owners.error;
  const emails: string[] = [];
  for (const owner of owners.data ?? []) {
    const profile = await admin
      .from('profiles')
      .select('email')
      .eq('user_id', owner.user_id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!profile.error && profile.data?.email) emails.push(String(profile.data.email));
  }
  return emails;
}

export async function mailOwners(
  companyId: string,
  template: string,
  data: Record<string, unknown>,
  key: string,
): Promise<void> {
  try {
    const link =
      typeof data.link === 'string' && data.link.startsWith('/')
        ? `${siteUrl()}${data.link}`
        : data.link;
    const emails = await ownerEmails(companyId);
    for (const [i, to] of emails.entries()) {
      await getService('email').enqueue({
        template,
        to,
        data: { ...data, link },
        companyId,
        idempotencyKey: `${key}:${i}`.slice(0, 120),
      });
    }
  } catch (error) {
    log.error('billing message not sent', { template, error: String(error) });
  }
}
