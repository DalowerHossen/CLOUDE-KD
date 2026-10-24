// path: app/(dashboard)/invoices/tax/clients/page.tsx
import { redirect } from 'next/navigation';

/** The client list of the tax area is the search on the tax page. */
export default function ClientsTaxIndex(): never {
  redirect('/invoices/tax');
}
