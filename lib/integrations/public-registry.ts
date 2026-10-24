// path: lib/integrations/public-registry.ts
// Every endpoint of the public API v1 in one list. The OpenAPI document is built from it, the developer documentation page
// shows it, and the check script compares it with the route files so a route cannot exist without being described.
import {
  clientCreate,
  clientOut,
  clientUpdate,
  clientsQuery,
  estimateCreate,
  estimateOut,
  estimatesQuery,
  idParams,
  invoiceCreate,
  invoiceOut,
  invoicesQuery,
  paymentOut,
  paymentsQuery,
  productCreate,
  productOut,
  productUpdate,
  productsQuery,
  statusOut,
} from './public-schemas';
import {
  hookInput,
  hookOut,
  hookParams,
  noteInput,
  noteOut,
  pollQuery,
  summaryOut,
  TRIGGERS,
  triggerItemOut,
} from './automation-rules';
import { z } from 'zod';

export interface EndpointSpec {
  method: 'get' | 'post' | 'patch' | 'delete';
  /** Path below `/api/public/v1`, with `{id}` for the id. */
  path: string;
  operationId: string;
  summary: string;
  tag: string;
  /** The scope the key needs; null for the open endpoints. */
  scope: string | null;
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodObject;
  bodyName?: string;
  response: z.ZodTypeAny;
  responseName: string;
  list?: boolean;
  idempotent?: boolean;
  createsRecord?: boolean;
  /** Works on the data of a sandbox key only; a live key gets a clear 501 until the owning STEPs offer write operations (R1). */
  sandboxOnly?: boolean;
  /** The answer holds a secret that is shown once, so the call is deliberately not idempotent (a stored replay would keep the secret). */
  returnsSecret?: boolean;
}

const read = (
  tag: string,
  path: string,
  resource: string,
  response: z.ZodTypeAny,
  responseName: string,
  query: z.ZodObject,
): EndpointSpec[] => [
  {
    method: 'get',
    path,
    operationId: `list_${resource}`,
    summary: `List ${resource}`,
    tag,
    scope: `read:${resource}`,
    query,
    response,
    responseName,
    list: true,
  },
  {
    method: 'get',
    path: `${path}/{id}`,
    operationId: `get_${resource}`,
    summary: `Get one of ${resource}`,
    tag,
    scope: `read:${resource}`,
    params: idParams,
    response,
    responseName,
  },
];

export const ENDPOINTS: readonly EndpointSpec[] = [
  ...read('Clients', '/clients', 'clients', clientOut, 'Client', clientsQuery),
  {
    method: 'post',
    path: '/clients',
    operationId: 'create_client',
    summary: 'Create a client (sandbox keys only for now)',
    tag: 'Clients',
    scope: 'write:clients',
    body: clientCreate,
    bodyName: 'ClientCreate',
    response: clientOut,
    responseName: 'Client',
    idempotent: true,
    createsRecord: true,
    sandboxOnly: true,
  },
  {
    method: 'patch',
    path: '/clients/{id}',
    operationId: 'update_client',
    summary: 'Change a client (sandbox keys only for now)',
    tag: 'Clients',
    scope: 'write:clients',
    params: idParams,
    body: clientUpdate,
    bodyName: 'ClientUpdate',
    response: clientOut,
    responseName: 'Client',
    sandboxOnly: true,
  },
  ...read('Products', '/products', 'products', productOut, 'Product', productsQuery),
  {
    method: 'post',
    path: '/products',
    operationId: 'create_product',
    summary: 'Create a product (sandbox keys only for now)',
    tag: 'Products',
    scope: 'write:products',
    body: productCreate,
    bodyName: 'ProductCreate',
    response: productOut,
    responseName: 'Product',
    idempotent: true,
    createsRecord: true,
    sandboxOnly: true,
  },
  {
    method: 'patch',
    path: '/products/{id}',
    operationId: 'update_product',
    summary: 'Change a product (sandbox keys only for now)',
    tag: 'Products',
    scope: 'write:products',
    params: idParams,
    body: productUpdate,
    bodyName: 'ProductUpdate',
    response: productOut,
    responseName: 'Product',
    sandboxOnly: true,
  },
  ...read('Invoices', '/invoices', 'invoices', invoiceOut, 'Invoice', invoicesQuery),
  {
    method: 'post',
    path: '/invoices',
    operationId: 'create_invoice',
    summary: 'Create a draft invoice (sandbox keys only for now)',
    tag: 'Invoices',
    scope: 'write:invoices',
    body: invoiceCreate,
    bodyName: 'InvoiceCreate',
    response: invoiceOut,
    responseName: 'Invoice',
    idempotent: true,
    createsRecord: true,
    sandboxOnly: true,
  },
  ...read('Payments', '/payments', 'payments', paymentOut, 'Payment', paymentsQuery),
  ...read('Estimates', '/estimates', 'estimates', estimateOut, 'Estimate', estimatesQuery),
  {
    method: 'post',
    path: '/estimates',
    operationId: 'create_estimate',
    summary: 'Create a draft estimate (sandbox keys only for now)',
    tag: 'Estimates',
    scope: 'write:estimates',
    body: estimateCreate,
    bodyName: 'EstimateCreate',
    response: estimateOut,
    responseName: 'Estimate',
    idempotent: true,
    createsRecord: true,
    sandboxOnly: true,
  },
  {
    method: 'get',
    path: '/status',
    operationId: 'get_status',
    summary: 'Service status',
    tag: 'Service',
    scope: null,
    response: statusOut,
    responseName: 'Status',
  },
  ...TRIGGERS.map((t): EndpointSpec => ({
    method: 'get',
    path: `/automation/triggers/${t.name}`,
    operationId: `poll_${t.name.replace(/-/g, '_')}`,
    summary: `Poll the trigger "${t.title}": the latest events, newest first (for Zapier and Make)`,
    tag: 'Automation',
    scope: t.scope,
    query: pollQuery,
    response: triggerItemOut,
    responseName: 'TriggerItem',
    list: true,
  })),
  {
    method: 'post',
    path: '/automation/hooks',
    operationId: 'subscribe_hook',
    summary: 'Subscribe a Zapier or Make hook URL to a trigger (live keys only)',
    tag: 'Automation',
    scope: 'write:webhooks',
    body: hookInput,
    bodyName: 'HookCreate',
    response: hookOut,
    responseName: 'Hook',
    createsRecord: true,
    returnsSecret: true,
  },
  {
    method: 'delete',
    path: '/automation/hooks/{id}',
    operationId: 'unsubscribe_hook',
    summary: 'Remove a hook made by Zapier or Make',
    tag: 'Automation',
    scope: 'write:webhooks',
    params: hookParams,
    response: z.object({ ok: z.literal(true) }),
    responseName: 'Done',
  },
  {
    method: 'post',
    path: '/automation/actions/record-payment-note',
    operationId: 'record_payment_note',
    summary: 'Add a note to a payment (sandbox keys only for now)',
    tag: 'Automation',
    scope: 'write:invoices',
    body: noteInput,
    bodyName: 'PaymentNote',
    response: noteOut,
    responseName: 'PaymentNoteResult',
    idempotent: true,
    sandboxOnly: true,
  },
  {
    method: 'get',
    path: '/automation/summary',
    operationId: 'get_summary',
    summary:
      'Invoice counts and the amount still owed, from the latest 100 invoices (used by the browser extension)',
    tag: 'Automation',
    scope: 'read:invoices',
    response: summaryOut,
    responseName: 'Summary',
  },
];
