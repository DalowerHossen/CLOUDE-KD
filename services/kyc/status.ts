// path: services/kyc/status.ts
// The `kyc` contract: status and isVerified for a company, plus the detailed gate state used by payment and payout
// screens. A verification that has passed its end date counts as not verified.
import 'server-only';
import { InternalError } from '@/lib/errors';
import { contractStatus, isExpired, type SubmissionStatus } from '@/lib/kyc/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { KycService, KycStatus } from '@/types/contracts';

export interface GateState {
  status: KycStatus;
  verified: boolean;
  expired: boolean;
  /** ISO time the verification ends, or null. */
  expiresAt: string | null;
}

export async function gateState(companyId: string): Promise<GateState> {
  const { data, error } = await getAdminSupabase()
    .from('kyc_submissions')
    .select('status, expires_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(2);
  if (error) throw new InternalError(error);
  const rows = data ?? [];
  // An open submission after an approved one (a renewal) does not remove the approval until it ends.
  const approved = rows.find((r) => r.status === 'approved');
  const latest = rows[0];
  const expired = approved
    ? isExpired(approved.expires_at ? String(approved.expires_at) : null)
    : false;
  if (approved && !expired)
    return {
      status: 'approved',
      verified: true,
      expired: false,
      expiresAt: approved.expires_at ? String(approved.expires_at) : null,
    };
  const status = contractStatus(
    latest ? (String(latest.status) as SubmissionStatus) : null,
    expired,
  );
  return {
    status,
    verified: false,
    expired,
    expiresAt: approved?.expires_at ? String(approved.expires_at) : null,
  };
}

export function createKycService(): KycService {
  return {
    status: async (companyId) => (await gateState(companyId)).status,
    isVerified: async (companyId) => (await gateState(companyId)).verified,
  };
}
