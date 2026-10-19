// path: services/mor/mode.ts
// The one place that decides how a company's payments are handled: `mor` (settled into the wallet after the hold),
// `direct` (recorded only; the platform fee is billed) or `suspended` (no new settlement). Also the gate that the
// payment flow can ask before it takes a payment, and the status the owner sees.
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError } from '@/lib/errors';
import {
  decideMode,
  type KycFacts,
  type ModeDecision,
  type MorRules,
} from '@/lib/payment/mor-engine';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { loadSettings } from './settings';

async function kycFacts(companyId: string): Promise<KycFacts> {
  const kyc = getService('kyc');
  const [status, verified] = await Promise.all([kyc.status(companyId), kyc.isVerified(companyId)]);
  // The contract reads an ended verification as "not submitted"; the date tells them apart.
  let expired = false;
  if (!verified) {
    const { data, error } = await getAdminSupabase()
      .from('kyc_submissions')
      .select('expires_at')
      .eq('company_id', companyId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('expires_at', { ascending: false })
      .limit(1);
    if (error) throw new InternalError(error);
    const end = data?.[0]?.expires_at;
    expired = Boolean(end) && Date.parse(String(end)) < Date.now();
  }
  return { status, verified, expired };
}

export interface ModeAnswer extends ModeDecision {
  rules: MorRules;
  suspendedReason: string | null;
}

export async function getMode(companyId: string): Promise<ModeAnswer> {
  const [settings, kyc] = await Promise.all([loadSettings(companyId), kycFacts(companyId)]);
  const decision = decideMode({
    platformEnabled: settings.rules.platformEnabled,
    companyEnabled: settings.rules.companyEnabled,
    suspended: settings.suspended,
    kyc,
  });
  return { ...decision, rules: settings.rules, suspendedReason: settings.suspendedReason };
}

export interface SettlementGate {
  /** True when a payment can be taken and settled into the wallet now. */
  settleable: boolean;
  mode: ModeDecision['mode'];
  reason: ModeDecision['reason'];
  message: string;
}

/** The answer the payment flow asks before it takes a payment (the call itself is the integrator's request R2). */
export async function settlementGate(companyId: string): Promise<SettlementGate> {
  const m = await getMode(companyId);
  return { settleable: m.mode === 'mor', mode: m.mode, reason: m.reason, message: m.message };
}
