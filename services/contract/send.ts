// path: services/contract/send.ts
// Sending a contract and what follows: the frozen wording and its hash, the invitation of each signer (all at once, or one
// after the other), reminders, the cancel, and the daily cycle (expiry, automatic reminders, renewal notices).
import 'server-only';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { siteUrl } from '@/lib/cms/site-url';
import { createLogger } from '@/lib/logger';
import { Money } from '@/lib/utils/currency';
import { formatMoney } from '@/lib/utils/formatting';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { sha256Hex } from '@/lib/utils/hash';
import { sendClientMail } from '@/services/portal/client-mail';
import type { Actor } from '@/types/contracts';
import { getContract, type ContractView, type SignerView } from './contracts';
import { mergeFields, type MergeValues } from './merge';
import { canMove, isOpen } from './status';

const log = createLogger({ component: 'contract-send' });

/** Days a signer waits before the first automatic reminder, and between reminders. */
export const REMINDER_EVERY_DAYS = 3;
export const MAX_AUTO_REMINDERS = 3;
/** The link works until the signing deadline, or this many days when no deadline was set. */
const DEFAULT_LINK_DAYS = 30;
const MAX_LINK_DAYS = 90;

export const contractLink = (token: string): string =>
  `${siteUrl()}/c/${encodeURIComponent(token)}`;

export async function addEvent(
  companyId: string,
  contractId: string,
  kind: string,
  detail = '',
  signerId: string | null = null,
  actorId: string | null = null,
): Promise<void> {
  const { error } = await getAdminSupabase()
    .from('contract_events')
    .insert({
      company_id: companyId,
      contract_id: contractId,
      kind,
      detail: detail.slice(0, 500),
      signer_id: signerId,
      actor_id: actorId,
    });
  if (error) log.error('contract event not stored', { kind });
}

export async function companyName(companyId: string): Promise<string> {
  const { data } = await getAdminSupabase()
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle();
  return String(data?.name ?? '');
}

function linkDays(contract: ContractView): number {
  if (!contract.signBy) return DEFAULT_LINK_DAYS;
  const days = Math.ceil((Date.parse(`${contract.signBy}T23:59:59Z`) - Date.now()) / 86_400_000);
  return Math.min(Math.max(days, 1), MAX_LINK_DAYS);
}

/** The values that replace the merge fields. */
export function mergeValues(contract: ContractView, company: string, today: string): MergeValues {
  return {
    client_name: contract.clientName,
    company_name: company,
    contract_number: contract.number,
    amount: contract.amount ? formatMoney(Money.parse(contract.amount)).replace('$', '') : '',
    date: today,
    start_date: contract.effectiveOn ?? '',
    end_date: contract.endsOn ?? '',
    terms: contract.terms,
  };
}

async function invite(
  companyId: string,
  contract: ContractView,
  signer: SignerView,
  company: string,
  message: string,
  reminder: boolean,
): Promise<void> {
  const tokens = getService('tokens');
  const admin = getAdminSupabase();
  const { data: row } = await admin
    .from('contract_signers')
    .select('token_id')
    .eq('id', signer.id)
    .eq('company_id', companyId)
    .maybeSingle();
  const existing = row?.token_id ? String(row.token_id) : null;
  const issued = existing
    ? await tokens.reissue(existing)
    : await tokens.issue({
        docType: 'contract',
        docId: signer.id,
        companyId,
        ttlDays: linkDays(contract),
        otpRequired: true,
      });
  await sendClientMail({
    companyId,
    template: reminder ? 'client.contract-reminder' : 'client.contract-sent',
    to: signer.email,
    data: {
      clientName: signer.name,
      companyName: company,
      title: contract.title,
      number: contract.number,
      signBy: contract.signBy ?? 'not set',
      message,
      link: contractLink(issued.token),
    },
    idempotencyKey: `contract-${reminder ? 'remind' : 'invite'}-${signer.id}-${issued.id}`,
    doc: { type: 'contract', id: contract.id },
    clientId: contract.clientId,
    tokenId: issued.id,
  });
  const now = new Date().toISOString();
  const { error } = await admin
    .from('contract_signers')
    .update(
      reminder
        ? { token_id: issued.id, last_reminded_at: now, reminder_count: signer.reminderCount + 1 }
        : { token_id: issued.id, invited_at: now },
    )
    .eq('id', signer.id);
  if (error) throw new InternalError(error);
  await addEvent(
    companyId,
    contract.id,
    reminder ? 'reminded' : 'invited',
    signer.email,
    signer.id,
  );
}

export interface SendResult {
  contract: ContractView;
  /** Signers whose message could not be sent; "remind" sends it again. */
  failed: string[];
}

export async function sendContract(actor: Actor, id: string, message: string): Promise<SendResult> {
  if (!actor.companyId) throw new NotFoundError();
  const companyId = actor.companyId;
  const draft = await getContract(companyId, id);
  if (draft.status !== 'draft') throw new ValidationError('This contract was already sent.');
  if (draft.signers.length === 0) throw new ValidationError('Add at least one signer.');
  if (draft.signBy && draft.signBy < new Date().toISOString().slice(0, 10))
    throw new ValidationError('The signing deadline has passed.');
  const company = await companyName(companyId);
  const today = new Date().toISOString().slice(0, 10);
  const merged = mergeFields(draft.bodyHtml, mergeValues(draft, company, today));
  if (merged.unknown.length > 0)
    throw new ValidationError(`Unknown merge field: ${merged.unknown.join(', ')}.`);
  if (merged.missing.length > 0)
    throw new ValidationError(`These merge fields have no value: ${merged.missing.join(', ')}.`);
  const hash = await sha256Hex(`${draft.title}\n${merged.html}`);
  const admin = getAdminSupabase();
  const { data: moved, error } = await admin
    .from('contracts')
    .update({
      body_html: merged.html,
      status: 'sent',
      body_hash: hash,
      sent_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .eq('version', draft.version)
    .select('id');
  if (error) throw new InternalError(error);
  if (!moved || moved.length === 0)
    throw new ValidationError('The contract was changed. Reload and try again.');
  const versions = await admin
    .from('contract_versions')
    .select('version_no')
    .eq('contract_id', id)
    .order('version_no', { ascending: false })
    .limit(1);
  await admin.from('contract_versions').insert({
    company_id: companyId,
    contract_id: id,
    version_no: Number(versions.data?.[0]?.version_no ?? 0) + 1,
    title: draft.title,
    body_html: merged.html,
    created_by: actor.userId,
  });
  await addEvent(companyId, id, 'sent', `hash ${hash.slice(0, 12)}`, null, actor.userId);
  const sent = await getContract(companyId, id);
  const first = sent.signingOrder === 'sequential' ? sent.signers.slice(0, 1) : sent.signers;
  const failed: string[] = [];
  for (const signer of first) {
    try {
      await invite(companyId, sent, signer, company, message, false);
    } catch {
      log.error('contract invitation failed', { contract: id });
      failed.push(signer.email);
    }
  }
  return { contract: await getContract(companyId, id), failed };
}

/** For a sequential contract: when a signer has signed, the next one is invited. Used by the signing page (13.6.b). */
export async function inviteNextSigner(companyId: string, contractId: string): Promise<boolean> {
  const contract = await getContract(companyId, contractId);
  if (!isOpen(contract.status) || contract.signingOrder !== 'sequential') return false;
  const next = contract.signers.find((s) => s.status !== 'signed');
  if (!next || next.invitedAt) return false;
  await invite(companyId, contract, next, await companyName(companyId), '', false);
  return true;
}

const DAY = 86_400_000;

/** Sends the message again with a fresh link. Returns how many signers were reminded. */
export async function remindSigners(
  actor: Actor | null,
  companyId: string,
  contractId: string,
  options: { onlyDue?: boolean } = {},
): Promise<number> {
  const contract = await getContract(companyId, contractId);
  if (!isOpen(contract.status))
    throw new ValidationError('This contract is not waiting for signatures.');
  const company = await companyName(companyId);
  let count = 0;
  for (const signer of contract.signers) {
    if (!signer.invitedAt || signer.status === 'signed' || signer.status === 'declined') continue;
    const last = Date.parse(signer.lastRemindedAt ?? signer.invitedAt);
    if (Date.now() - last < (options.onlyDue ? REMINDER_EVERY_DAYS : 1) * DAY) continue;
    if (options.onlyDue && signer.reminderCount >= MAX_AUTO_REMINDERS) continue;
    try {
      await invite(companyId, contract, signer, company, '', true);
      count += 1;
    } catch {
      log.error('contract reminder failed', { contract: contractId });
    }
  }
  if (actor && count === 0)
    throw new ValidationError('Nobody can be reminded yet. Try again tomorrow.');
  return count;
}

export async function revokeTokens(contract: ContractView): Promise<void> {
  const { data } = await getAdminSupabase()
    .from('contract_signers')
    .select('token_id')
    .eq('contract_id', contract.id)
    .is('deleted_at', null);
  for (const row of data ?? [])
    if (row.token_id)
      await getService('tokens')
        .revoke(String(row.token_id))
        .catch(() => undefined);
}

async function close(
  companyId: string,
  contract: ContractView,
  to: 'void' | 'expired',
  reason: string,
  actorId: string | null,
): Promise<void> {
  if (!canMove(contract.status, to))
    throw new ValidationError('This contract cannot be closed now.');
  const { data, error } = await getAdminSupabase()
    .from('contracts')
    .update({ status: to, closed_reason: reason })
    .eq('id', contract.id)
    .eq('company_id', companyId)
    .eq('status', contract.status)
    .select('id');
  if (error) throw new InternalError(error);
  if (!data || data.length === 0)
    throw new ValidationError('The contract was changed. Reload and try again.');
  await revokeTokens(contract);
  await addEvent(
    companyId,
    contract.id,
    to === 'void' ? 'voided' : 'expired',
    reason,
    null,
    actorId,
  );
}

/** Cancels a draft or a contract that is waiting for signatures; every signing link stops working. */
export async function voidContract(
  actor: Actor,
  id: string,
  reason: string,
): Promise<ContractView> {
  if (!actor.companyId) throw new NotFoundError();
  const contract = await getContract(actor.companyId, id);
  await close(actor.companyId, contract, 'void', reason, actor.userId);
  return getContract(actor.companyId, id);
}

export interface CycleResult {
  expired: number;
  reminded: number;
  renewals: number;
}

/** Daily job: contracts past their signing date expire, silent signers are reminded, ending contracts are announced. */
export async function runContractCycle(now: Date = new Date()): Promise<CycleResult> {
  const admin = getAdminSupabase();
  const today = now.toISOString().slice(0, 10);
  const result: CycleResult = { expired: 0, reminded: 0, renewals: 0 };

  const late = await admin
    .from('contracts')
    .select('id, company_id')
    .in('status', ['sent', 'viewed', 'partly_signed'])
    .lt('sign_by', today)
    .is('deleted_at', null)
    .limit(500);
  for (const row of late.data ?? []) {
    try {
      const contract = await getContract(String(row.company_id), String(row.id));
      await close(String(row.company_id), contract, 'expired', 'The signing date passed.', null);
      result.expired += 1;
    } catch {
      log.error('contract expiry failed', {});
    }
  }

  const open = await admin
    .from('contracts')
    .select('id, company_id')
    .in('status', ['sent', 'viewed', 'partly_signed'])
    .is('deleted_at', null)
    .limit(500);
  for (const row of open.data ?? []) {
    try {
      result.reminded += await remindSigners(null, String(row.company_id), String(row.id), {
        onlyDue: true,
      });
    } catch {
      log.error('contract reminder run failed', {});
    }
  }

  const ending = await admin
    .from('contracts')
    .select('id, company_id, number, title, ends_on, renewal_notice_days')
    .eq('status', 'signed')
    .is('renewal_notified_at', null)
    .gte('ends_on', today)
    .is('deleted_at', null)
    .limit(500);
  for (const row of ending.data ?? []) {
    const notifyFrom =
      Date.parse(`${String(row.ends_on)}T00:00:00Z`) - Number(row.renewal_notice_days) * DAY;
    if (notifyFrom > now.getTime()) continue;
    const marked = await admin
      .from('contracts')
      .update({ renewal_notified_at: now.toISOString() })
      .eq('id', row.id)
      .is('renewal_notified_at', null)
      .select('id');
    if (!marked.data || marked.data.length === 0) continue;
    await addEvent(
      String(row.company_id),
      String(row.id),
      'renewal_notice',
      `ends ${String(row.ends_on)}`,
    );
    await getService('notification')
      .notify({
        companyId: String(row.company_id),
        type: 'contract.ending',
        title: 'A contract is about to end',
        body: `Contract ${String(row.title)} ends on ${String(row.ends_on)}. Renew it or let it end.`,
        href: `/contracts/${String(row.id)}`,
      })
      .catch(() => undefined);
    result.renewals += 1;
  }
  return result;
}
