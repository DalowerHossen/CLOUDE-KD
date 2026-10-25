// path: workers/integrations/checkout-session-events.event.ts
// A store that uses the hosted checkout learns about its orders through webhooks: when the invoice behind a checkout session is
// paid, or a payment for it fails, this writes the session event ("checkout.session.paid" or "checkout.session.failed") that the
// store's webhook endpoints subscribe to. Safe to run again: a session is marked paid once, and only that run publishes the event.
import { getService } from '@/lib/container';
import type { EventHandlerDefinition } from '@/services/jobs/handler-types';
import { getAdminSupabase } from '@/lib/supabase/admin';

interface SessionRow {
  id: string;
  external_ref: string;
  amount: string;
  status: string;
}

async function sessionOfInvoice(companyId: string, invoiceId: string): Promise<SessionRow | null> {
  const { data, error } = await getAdminSupabase()
    .from('checkout_sessions')
    .select('id, external_ref, amount, status')
    .eq('company_id', companyId)
    .eq('invoice_id', invoiceId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return (data as SessionRow | null) ?? null;
}

export const eventHandler: EventHandlerDefinition = {
  id: 'checkout.session-events',
  events: ['invoice.paid', 'payment.failed'],
  async handle(event) {
    const invoiceId = typeof event.payload.invoiceId === 'string' ? event.payload.invoiceId : null;
    if (event.companyId === null || invoiceId === null) return;
    const session = await sessionOfInvoice(event.companyId, invoiceId);
    if (!session) return;
    if (event.name === 'invoice.paid') {
      const paidAt = new Date().toISOString();
      const { data, error } = await getAdminSupabase()
        .from('checkout_sessions')
        .update({ status: 'paid', paid_at: paidAt })
        .eq('id', session.id)
        .eq('company_id', event.companyId)
        .in('status', ['open', 'expired'])
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      await getService('events').publish({
        name: 'checkout.session.paid',
        companyId: event.companyId,
        payload: {
          sessionId: session.id,
          orderId: session.external_ref,
          amount: session.amount,
          currency: 'USD',
          status: 'paid',
          paidAt,
        },
      });
      return;
    }
    if (session.status !== 'open') return;
    await getService('events').publish({
      name: 'checkout.session.failed',
      companyId: event.companyId,
      payload: {
        sessionId: session.id,
        orderId: session.external_ref,
        amount: session.amount,
        currency: 'USD',
        status: 'open',
        reason: 'The payment did not go through. The buyer can try again with the same link.',
      },
    });
  },
};
