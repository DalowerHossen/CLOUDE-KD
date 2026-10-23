// path: services/messaging/reports.ts
// Reports of messaging: how many messages each channel sent, delivered and got opened or read, and what the messages cost per
// month and channel (the cost of a message is the company's own figure for the channel, kept on the message when it is sent).
import 'server-only';
import { InternalError } from '@/lib/errors';
import { channelReport, monthlyCost, monthOf } from '@/lib/messaging/rules';
import { getAdminSupabase } from '@/lib/supabase/admin';

export async function channelStats(
  companyId: string,
  days = 30,
): Promise<ReturnType<typeof channelReport>> {
  const { data, error } = await getAdminSupabase()
    .from('messaging_messages')
    .select('channel, delivered, engaged_at')
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .gte('sent_at', new Date(Date.now() - days * 86_400_000).toISOString())
    .is('deleted_at', null)
    .limit(50_000);
  if (error) throw new InternalError(error);
  return channelReport(
    (data ?? []).map((r) => ({
      channel: r.channel === null ? null : String(r.channel),
      delivered: r.delivered === true,
      engaged: r.engaged_at !== null,
    })),
  );
}

export async function costReport(
  companyId: string,
  months = 12,
): Promise<ReturnType<typeof monthlyCost>> {
  const since = new Date(Date.now() - months * 31 * 86_400_000).toISOString();
  const { data, error } = await getAdminSupabase()
    .from('messaging_messages')
    .select('channel, cost, sent_at')
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .gte('sent_at', since)
    .is('deleted_at', null)
    .limit(100_000);
  if (error) throw new InternalError(error);
  return monthlyCost(
    (data ?? []).map((r) => ({
      month: monthOf(String(r.sent_at)),
      channel: String(r.channel),
      cost: String(r.cost),
    })),
  ).slice(0, months);
}
