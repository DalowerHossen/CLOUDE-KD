// path: app/(dashboard)/subscriptions/billing/invoices/page.tsx
import { redirect } from 'next/navigation';

/** The list of invoices is on the billing page; this address only forwards there. */
export default function InvoicesIndexPage(): never {
  redirect('/subscriptions/billing');
}
