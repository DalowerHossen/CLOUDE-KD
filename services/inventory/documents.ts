// path: services/inventory/documents.ts
// Inventory documents: receipts, issues, returns, packing slips and delivery notes. A draft can be changed; posting it
// moves the stock in one all-or-nothing step and fixes the document. A posted document is never edited: a mistake is
// corrected with a return, an adjustment or a count.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { decodeCursor, encodeCursor } from '@/lib/crm/search';
import {
  DOCUMENT_PREFIX,
  formatNumber,
  type DocumentInput,
  type DocumentKind,
} from '@/lib/stock/documents';
import { Money } from '@/lib/utils/currency';
import { getAdminSupabase } from '@/lib/supabase/admin';
import type { Actor } from '@/types/contracts';
import { ensureDefaultWarehouse } from './warehouses';

const dec = (v: unknown): string => Money.parseRounded(String(v ?? '0')).toDbString();
const PAGE = 25;

export interface DocumentLineView {
  position: number;
  productId: string;
  productName: string;
  variantId: string | null;
  variantName: string;
  sku: string | null;
  quantity: string;
  unitCost: string | null;
  batchNo: string | null;
  expiresOn: string | null;
  note: string;
}
export interface DocumentView {
  id: string;
  kind: DocumentKind;
  number: string;
  status: 'draft' | 'posted' | 'cancelled';
  warehouseId: string;
  warehouseName: string;
  partyType: 'none' | 'client' | 'supplier';
  partyId: string | null;
  partyName: string;
  reference: string;
  note: string;
  postedAt: string | null;
  createdAt: string;
  version: number;
  lines: DocumentLineView[];
}
export interface DocumentRow {
  id: string;
  kind: DocumentKind;
  number: string;
  status: 'draft' | 'posted' | 'cancelled';
  partyName: string;
  warehouseName: string;
  createdAt: string;
}

const COLUMNS =
  'id, kind, number, status, warehouse_id, party_type, party_id, party_name, reference, note, posted_at, created_at, version';
type Row = Record<string, unknown>;

async function warehouseName(companyId: string, id: string): Promise<string> {
  const { data } = await getAdminSupabase()
    .from('warehouses')
    .select('name')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  return String(data?.name ?? '');
}

async function lines(companyId: string, documentId: string): Promise<DocumentLineView[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from('inventory_document_lines')
    .select('position, product_id, variant_id, quantity, unit_cost, batch_no, expires_on, note')
    .eq('company_id', companyId)
    .eq('document_id', documentId)
    .is('deleted_at', null)
    .order('position');
  if (error) throw new InternalError(error);
  const pids = [...new Set((data ?? []).map((r) => String(r.product_id)))];
  const vids = [
    ...new Set((data ?? []).flatMap((r) => (r.variant_id ? [String(r.variant_id)] : []))),
  ];
  const [p, v] = await Promise.all([
    pids.length
      ? admin.from('products').select('id, name, sku').in('id', pids)
      : Promise.resolve({ data: [] as Row[] }),
    vids.length
      ? admin.from('product_variants').select('id, name').in('id', vids)
      : Promise.resolve({ data: [] as Row[] }),
  ]);
  const pm = new Map((p.data ?? []).map((x) => [String(x.id), x]));
  const vm = new Map((v.data ?? []).map((x) => [String(x.id), String(x.name)]));
  return (data ?? []).map((r) => ({
    position: Math.trunc(Number(r.position)),
    productId: String(r.product_id),
    productName: String(pm.get(String(r.product_id))?.name ?? ''),
    variantId: r.variant_id ? String(r.variant_id) : null,
    variantName: r.variant_id ? (vm.get(String(r.variant_id)) ?? '') : '',
    sku: pm.get(String(r.product_id))?.sku ? String(pm.get(String(r.product_id))?.sku) : null,
    quantity: dec(r.quantity),
    unitCost: r.unit_cost === null || r.unit_cost === undefined ? null : dec(r.unit_cost),
    batchNo: r.batch_no ? String(r.batch_no) : null,
    expiresOn: r.expires_on ? String(r.expires_on) : null,
    note: String(r.note ?? ''),
  }));
}

export async function getDocument(companyId: string, id: string): Promise<DocumentView> {
  const { data, error } = await getAdminSupabase()
    .from('inventory_documents')
    .select(COLUMNS)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return {
    id: String(data.id),
    kind: String(data.kind) as DocumentKind,
    number: String(data.number),
    status: String(data.status) as DocumentView['status'],
    warehouseId: String(data.warehouse_id),
    warehouseName: await warehouseName(companyId, String(data.warehouse_id)),
    partyType: String(data.party_type) as DocumentView['partyType'],
    partyId: data.party_id ? String(data.party_id) : null,
    partyName: String(data.party_name ?? ''),
    reference: String(data.reference ?? ''),
    note: String(data.note ?? ''),
    postedAt: data.posted_at ? String(data.posted_at) : null,
    createdAt: String(data.created_at),
    version: Math.trunc(Number(data.version)),
    lines: await lines(companyId, id),
  };
}

export async function listDocuments(
  companyId: string,
  query: { kind?: DocumentKind; status?: 'draft' | 'posted' | 'cancelled'; after?: string },
): Promise<{ rows: DocumentRow[]; next: string | null }> {
  const admin = getAdminSupabase();
  const cursor = decodeCursor(query.after);
  let q = admin
    .from('inventory_documents')
    .select('id, kind, number, status, party_name, warehouse_id, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE + 1);
  if (query.kind) q = q.eq('kind', query.kind);
  if (query.status) q = q.eq('status', query.status);
  if (cursor)
    q = q.or(`created_at.lt."${cursor.v}",and(created_at.eq."${cursor.v}",id.lt.${cursor.id})`);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const all = data ?? [];
  const page = all.slice(0, PAGE);
  const wids = [...new Set(page.map((r) => String(r.warehouse_id)))];
  const w = wids.length
    ? await admin.from('warehouses').select('id, name').in('id', wids)
    : { data: [] as Row[] };
  const wm = new Map((w.data ?? []).map((x) => [String(x.id), String(x.name)]));
  const last = page[page.length - 1];
  return {
    rows: page.map((r) => ({
      id: String(r.id),
      kind: String(r.kind) as DocumentKind,
      number: String(r.number),
      status: String(r.status) as DocumentRow['status'],
      partyName: String(r.party_name ?? ''),
      warehouseName: wm.get(String(r.warehouse_id)) ?? '',
      createdAt: String(r.created_at),
    })),
    next:
      all.length > PAGE && last
        ? encodeCursor({ v: String(last.created_at), id: String(last.id) })
        : null,
  };
}

async function assertLines(
  companyId: string,
  warehouseId: string,
  input: DocumentInput,
): Promise<void> {
  const admin = getAdminSupabase();
  const wh = await admin
    .from('warehouses')
    .select('id')
    .eq('id', warehouseId)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (!wh.data) throw new ValidationError('Choose one of your active warehouses.');
  const ids = [...new Set(input.lines.map((l) => l.productId))];
  const { data, error } = await admin
    .from('products')
    .select('id, kind, track_inventory')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('id', ids);
  if (error) throw new InternalError(error);
  if ((data ?? []).length !== ids.length) throw new ValidationError('Some items were not found.');
  const moves =
    input.kind === 'receipt' ||
    input.kind === 'issue' ||
    input.kind === 'sales_return' ||
    input.kind === 'purchase_return';
  if (moves && (data ?? []).some((p) => p.kind !== 'product' || p.track_inventory !== true))
    throw new ValidationError('Only products with stock tracking can be on a stock document.');
  const vids = input.lines.flatMap((l) => (l.variantId ? [l.variantId] : []));
  if (vids.length > 0) {
    const v = await admin
      .from('product_variants')
      .select('id, product_id')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('id', vids);
    for (const l of input.lines)
      if (
        l.variantId &&
        !(v.data ?? []).some(
          (x) => String(x.id) === l.variantId && String(x.product_id) === l.productId,
        )
      )
        throw new ValidationError('A variant does not belong to its item.');
  }
}

async function writeLines(
  companyId: string,
  documentId: string,
  input: DocumentInput,
): Promise<void> {
  const admin = getAdminSupabase();
  const gone = await admin
    .from('inventory_document_lines')
    .update({ deleted_at: new Date().toISOString() })
    .eq('document_id', documentId)
    .eq('company_id', companyId)
    .is('deleted_at', null);
  if (gone.error) throw new InternalError(gone.error);
  const rows = input.lines.map((l, i) => ({
    company_id: companyId,
    document_id: documentId,
    position: i + 1,
    product_id: l.productId,
    variant_id: l.variantId,
    quantity: l.quantity,
    unit_cost: l.unitCost,
    batch_no: l.batchNo,
    expires_on: l.expiresOn,
    note: l.note,
  }));
  // tenant-ok: every row carries company_id
  const r = await admin.from('inventory_document_lines').insert(rows);
  if (r.error) throw new InternalError(r.error);
}

async function nextNumber(companyId: string, kind: DocumentKind): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = DOCUMENT_PREFIX[kind];
  const { data, error } = await getAdminSupabase().rpc('kd_next_number', {
    p_company: companyId,
    p_key: `${prefix}:${year}`,
  });
  if (error) throw new InternalError(error);
  return formatNumber(prefix, year, Math.trunc(Number(data)));
}

export async function createDocument(actor: Actor, input: DocumentInput): Promise<DocumentView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  await ensureDefaultWarehouse(companyId);
  await assertLines(companyId, input.warehouseId, input);
  const number = await nextNumber(companyId, input.kind);
  const { data, error } = await getAdminSupabase()
    .from('inventory_documents')
    .insert({
      company_id: companyId,
      kind: input.kind,
      number,
      warehouse_id: input.warehouseId,
      party_type: input.partyType,
      party_id: input.partyId,
      party_name: input.partyName,
      reference: input.reference,
      note: input.note,
      created_by: actor.userId,
    })
    .select('id')
    .single();
  if (error) throw new InternalError(error);
  const id = String(data.id);
  await writeLines(companyId, id, input);
  await getService('audit').record({
    action: 'inventory_document.created',
    resourceType: 'inventory_document',
    resourceId: id,
    companyId,
    metadata: { kind: input.kind, number, by: actor.userId },
  });
  return getDocument(companyId, id);
}

export async function updateDocument(
  actor: Actor,
  id: string,
  expectedVersion: number,
  input: DocumentInput,
): Promise<DocumentView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const current = await getDocument(companyId, id);
  if (current.status !== 'draft') throw new ValidationError('Only a draft can be changed.');
  if (current.kind !== input.kind)
    throw new ValidationError('The kind of a document cannot be changed.');
  await assertLines(companyId, input.warehouseId, input);
  const r = await getAdminSupabase()
    .from('inventory_documents')
    .update({
      warehouse_id: input.warehouseId,
      party_type: input.partyType,
      party_id: input.partyId,
      party_name: input.partyName,
      reference: input.reference,
      note: input.note,
    })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('version', expectedVersion)
    .eq('status', 'draft')
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ConflictError();
  await writeLines(companyId, id, input);
  await getService('audit').record({
    action: 'inventory_document.updated',
    resourceType: 'inventory_document',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return getDocument(companyId, id);
}

export async function postDocument(actor: Actor, id: string): Promise<DocumentView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const current = await getDocument(companyId, id);
  const { data, error } = await getAdminSupabase().rpc('kd_inventory_document_post', {
    p_company: companyId,
    p_doc: id,
    p_by: actor.userId,
  });
  if (error) {
    if (error.code === 'KD001') {
      const m = /available (-?[0-9.]+)/.exec(error.message ?? '');
      throw new ValidationError(
        m?.[1]
          ? `Not enough stock for one of the lines. Available: ${dec(m[1])}.`
          : 'Not enough stock for one of the lines.',
      );
    }
    if (error.code === '22023') throw new ValidationError('This document cannot be posted.');
    throw new InternalError(error);
  }
  for (const a of (data ?? []) as { productId: string; state: string }[]) {
    const p = await getAdminSupabase()
      .from('products')
      .select('name')
      .eq('id', a.productId)
      .maybeSingle();
    await getService('notification')
      .notify({
        companyId,
        type: a.state === 'out' ? 'stock.out' : 'stock.low',
        title:
          a.state === 'out'
            ? `Out of stock: ${String(p.data?.name ?? 'An item')}`
            : `Low stock: ${String(p.data?.name ?? 'An item')}`,
        body: `After ${current.number}.`,
        href: `/products/${a.productId}`,
      })
      .catch(() => undefined);
  }
  await getService('audit').record({
    action: 'inventory_document.posted',
    resourceType: 'inventory_document',
    resourceId: id,
    companyId,
    metadata: { number: current.number, by: actor.userId },
  });
  return getDocument(companyId, id);
}

export async function cancelDocument(actor: Actor, id: string): Promise<DocumentView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const r = await getAdminSupabase()
    .from('inventory_documents')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('status', 'draft')
    .is('deleted_at', null)
    .select('id');
  if (r.error) throw new InternalError(r.error);
  if (!r.data || r.data.length === 0) throw new ValidationError('Only a draft can be cancelled.');
  await getService('audit').record({
    action: 'inventory_document.cancelled',
    resourceType: 'inventory_document',
    resourceId: id,
    companyId,
    metadata: { by: actor.userId },
  });
  return getDocument(companyId, id);
}
