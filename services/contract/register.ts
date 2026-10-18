// path: services/contract/register.ts
// Tells the tokens service where the one-time code for a contract link goes: the e-mail address of that signer. The
// link's document id is the signer id, so the code can only reach the person who was invited.
import { registerOtpRecipientResolver } from '@/services/security/token-service';
import { getAdminSupabase } from '@/lib/supabase/admin';

export default async function register(): Promise<void> {
  registerOtpRecipientResolver('contract', async (companyId, signerId) => {
    const { data } = await getAdminSupabase()
      .from('contract_signers')
      .select('email')
      .eq('id', signerId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle();
    return data?.email ? String(data.email) : null;
  });
}
