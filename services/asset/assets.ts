// path: services/asset/assets.ts
// Fixed assets: register an asset (optionally booking the purchase), change the descriptive fields, import a list of assets that
// are already on the books, and keep photos and documents of an asset through the storage contract. Cost, dates, life and method
// are fixed by the database once depreciation has been booked.
import 'server-only';
import { createHash } from 'node:crypto';
import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES } from '@/config/s15-accounting';
import { getService } from '@/lib/container';
import { InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { toInt } from '@/lib/reports/numbers';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { attachmentInput } from '@/services/accounting/attachments';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { asMethod, listAssetCategories } from './categories';
import {
  assetInput,
  assetUpdate,
  monthStart,
  parseAssetsCsv,
  purchaseLines,
  schedule,
  type Method,
  type ScheduleRow,
} from './depreciation-rules';
import { postAssetEntry } from './entries';

export interface AssetView {
  id: string;
  name: string;
  categoryId: string;
  purchaseDate: string;
  inServiceDate: string;
  cost: string;
  salvageValue: string;
  lifeMonths: number;
  method: Method;
  decliningFactor: string;
  totalUnits: string | null;
  location: string;
  serialNumber: string;
  vendor: string;
  warrantyUntil: string | null;
  warrantyNote: string;
  status: 'active' | 'sold' | 'disposed';
  disposedOn: string | null;
  disposalProceeds: string | null;
  disposalGainLoss: string | null;
  accumulated: string;
  netBookValue: string;
  monthsDone: number;
  version: number;
}

export const ASSET_COLUMNS =
  'id, name, category_id, purchase_date, in_service_date, cost, salvage_value, life_months, method, declining_factor, total_units, location, serial_number, vendor, warranty_until, warranty_note, status, disposed_on, disposal_proceeds, disposal_gain_loss, version';

export interface AssetRow {
  id: string;
  name: string;
  category_id: string;
  purchase_date: string;
  in_service_date: string;
  cost: string | number;
  salvage_value: string | number;
  life_months: number;
  method: string;
  declining_factor: string | number;
  total_units: string | number | null;
  location: string;
  serial_number: string;
  vendor: string;
  warranty_until: string | null;
  warranty_note: string;
  status: string;
  disposed_on: string | null;
  disposal_proceeds: string | number | null;
  disposal_gain_loss: string | number | null;
  version: number;
}

const money = (v: string | number): string => Money.parseRounded(String(v)).toDbString();
const moneyOrNull = (v: string | number | null): string | null => (v === null ? null : money(v));

export function assetView(r: AssetRow, accumulated: string, monthsDone: number): AssetView {
  return {
    id: r.id,
    name: r.name,
    categoryId: r.category_id,
    purchaseDate: String(r.purchase_date),
    inServiceDate: String(r.in_service_date),
    cost: money(r.cost),
    salvageValue: money(r.salvage_value),
    lifeMonths: toInt(r.life_months),
    method: asMethod(r.method),
    decliningFactor: money(r.declining_factor),
    totalUnits: moneyOrNull(r.total_units),
    location: r.location,
    serialNumber: r.serial_number,
    vendor: r.vendor,
    warrantyUntil: r.warranty_until ? String(r.warranty_until) : null,
    warrantyNote: r.warranty_note,
    status: r.status === 'sold' ? 'sold' : r.status === 'disposed' ? 'disposed' : 'active',
    disposedOn: r.disposed_on ? String(r.disposed_on) : null,
    disposalProceeds: moneyOrNull(r.disposal_proceeds),
    disposalGainLoss: moneyOrNull(r.disposal_gain_loss),
    accumulated,
    netBookValue: Money.parse(money(r.cost)).sub(accumulated).toDbString(),
    monthsDone,
    version: r.version,
  };
}

/** Depreciation booked so far per asset: the total and the number of months. */
export async function depreciationTotals(
  companyId: string,
  assetIds?: readonly string[],
): Promise<Map<string, { accumulated: string; months: number }>> {
  let q = getAdminSupabase()
    .from('asset_depreciation')
    .select('asset_id, amount')
    .eq('company_id', companyId)
    .limit(50_000);
  if (assetIds) q = q.in('asset_id', [...assetIds]);
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const out = new Map<string, { accumulated: Money; months: number }>();
  for (const r of data ?? []) {
    const cur = out.get(String(r.asset_id)) ?? { accumulated: Money.zero(), months: 0 };
    out.set(String(r.asset_id), {
      accumulated: cur.accumulated.add(money(r.amount as string | number)),
      months: cur.months + 1,
    });
  }
  return new Map(
    [...out].map(([k, v]) => [k, { accumulated: v.accumulated.toDbString(), months: v.months }]),
  );
}

export interface AssetFilter {
  status?: 'active' | 'sold' | 'disposed';
  categoryId?: string;
  search?: string;
}

export async function listAssets(
  companyId: string,
  filter: AssetFilter = {},
): Promise<AssetView[]> {
  let q = getAdminSupabase()
    .from('fixed_assets')
    .select(ASSET_COLUMNS)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(5000);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.categoryId) q = q.eq('category_id', filter.categoryId);
  if (filter.search) {
    const s = filter.search.replace(/[%,()*\\]/g, ' ').trim();
    if (s) q = q.or(`name.ilike.%${s}%,serial_number.ilike.%${s}%,location.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw new InternalError(error);
  const rows = (data ?? []) as unknown as AssetRow[];
  const totals = await depreciationTotals(companyId);
  return rows.map((r) => {
    const t = totals.get(r.id);
    return assetView(r, t?.accumulated ?? '0.0000', t?.months ?? 0);
  });
}

export async function getAsset(companyId: string, id: string): Promise<AssetView> {
  const { data, error } = await getAdminSupabase()
    .from('fixed_assets')
    .select(ASSET_COLUMNS)
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  const t = (await depreciationTotals(companyId, [id])).get(id);
  return assetView(data as unknown as AssetRow, t?.accumulated ?? '0.0000', t?.months ?? 0);
}

/** The planned schedule of an asset (empty for units of production) with the months already booked marked. */
export async function scheduleOf(
  companyId: string,
  id: string,
): Promise<(ScheduleRow & { booked: boolean })[]> {
  const asset = await getAsset(companyId, id);
  const rows = schedule({
    cost: asset.cost,
    salvage: asset.salvageValue,
    lifeMonths: asset.lifeMonths,
    method: asset.method,
    factor: asset.decliningFactor,
    totalUnits: asset.totalUnits,
    inService: asset.inServiceDate,
  });
  const { data, error } = await getAdminSupabase()
    .from('asset_depreciation')
    .select('period_month')
    .eq('company_id', companyId)
    .eq('asset_id', id)
    .limit(2000);
  if (error) throw new InternalError(error);
  const booked = new Set((data ?? []).map((r) => String(r.period_month)));
  return rows.map((r) => ({ ...r, booked: booked.has(r.month) }));
}

async function insertAsset(
  actor: Actor,
  companyId: string,
  d: Omit<ReturnType<typeof assetInput.parse>, never>,
): Promise<AssetView> {
  const inService = d.inServiceDate ?? d.purchaseDate;
  const { data, error } = await getAdminSupabase()
    .from('fixed_assets')
    .insert({
      company_id: companyId,
      name: d.name,
      category_id: d.categoryId,
      purchase_date: d.purchaseDate,
      in_service_date: inService,
      cost: d.cost,
      salvage_value: d.salvageValue,
      life_months: d.lifeMonths,
      method: d.method,
      declining_factor: d.decliningFactor,
      total_units: d.totalUnits,
      location: d.location,
      serial_number: d.serialNumber,
      vendor: d.vendor,
      warranty_until: d.warrantyUntil,
      warranty_note: d.warrantyNote,
      created_by: actor.userId,
    })
    .select(ASSET_COLUMNS)
    .single();
  if (error) mapAccountingError(error);
  const asset = assetView(data as unknown as AssetRow, '0.0000', 0);
  if (d.fundedFrom !== 'none') {
    const categories = await listAssetCategories(companyId);
    const category = categories.find((c) => c.id === d.categoryId);
    const posted = await postAssetEntry({
      companyId,
      date: d.purchaseDate,
      memo: `Purchase of ${d.name}`,
      sourceType: 'fixed_asset',
      sourceId: asset.id,
      sourceKey: `asset-purchase:${asset.id}`,
      lines: purchaseLines(
        Money.parse(d.cost),
        d.fundedFrom,
        d.name,
        category?.assetAccountId ?? undefined,
      ),
    });
    const upd = await getAdminSupabase()
      .from('fixed_assets')
      .update({ purchase_entry_id: posted.entryId })
      .eq('id', asset.id);
    if (upd.error) throw new InternalError(upd.error);
  }
  await getService('audit').record({
    action: 'asset.created',
    resourceType: 'fixed_asset',
    resourceId: asset.id,
    companyId,
    metadata: { name: d.name, cost: d.cost, funded: d.fundedFrom },
  });
  return asset;
}

export async function createAsset(actor: Actor, input: unknown): Promise<AssetView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = assetInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The asset is not valid.');
  return insertAsset(actor, companyId, parsed.data);
}

export async function updateAsset(actor: Actor, id: string, input: unknown): Promise<AssetView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = assetUpdate.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The change is not valid.');
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.location !== undefined) patch.location = d.location;
  if (d.serialNumber !== undefined) patch.serial_number = d.serialNumber;
  if (d.vendor !== undefined) patch.vendor = d.vendor;
  if (d.warrantyUntil !== undefined) patch.warranty_until = d.warrantyUntil;
  if (d.warrantyNote !== undefined) patch.warranty_note = d.warrantyNote;
  const { data, error } = await getAdminSupabase()
    .from('fixed_assets')
    .update(patch)
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', d.version)
    .is('deleted_at', null)
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'asset.changed',
    resourceType: 'fixed_asset',
    resourceId: id,
    companyId,
    metadata: { fields: Object.keys(patch) },
  });
  return getAsset(companyId, id);
}

export interface AssetImportResult {
  created: number;
  errors: { line: number; message: string }[];
}

/** Imports assets that are already on the books: nothing is posted and depreciation starts from the in-service month. */
export async function importAssets(actor: Actor, csv: string): Promise<AssetImportResult> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = parseAssetsCsv(csv);
  const errors = [...parsed.errors];
  const categories = await listAssetCategories(companyId);
  let made = 0;
  for (const a of parsed.assets) {
    const category = categories.find(
      (c) => c.name.toLowerCase() === a.category.toLowerCase() && c.status === 'active',
    );
    if (!category) {
      errors.push({ line: a.line, message: `The category "${a.category}" does not exist.` });
      continue;
    }
    try {
      await insertAsset(actor, companyId, { ...a.input, categoryId: category.id });
      made += 1;
    } catch (error) {
      errors.push({
        line: a.line,
        message: error instanceof Error ? error.message : 'The asset could not be added.',
      });
    }
  }
  return { created: made, errors };
}

export interface AssetDocumentView {
  id: string;
  name: string;
}

export async function listAssetDocuments(
  companyId: string,
  assetId: string,
): Promise<AssetDocumentView[]> {
  const { data, error } = await getAdminSupabase()
    .from('asset_documents')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('asset_id', assetId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new InternalError(error);
  return (data ?? []).map((r) => ({ id: String(r.id), name: String(r.name) }));
}

export async function addAssetDocument(
  actor: Actor,
  assetId: string,
  input: unknown,
): Promise<AssetDocumentView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = attachmentInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The file is not valid.');
  await getAsset(companyId, assetId);
  const bytes = new Uint8Array(Buffer.from(parsed.data.dataBase64, 'base64'));
  if (
    bytes.length === 0 ||
    bytes.length > MAX_ATTACHMENT_BYTES ||
    !ATTACHMENT_TYPES.includes(parsed.data.mimeType)
  )
    throw new ValidationError('Use a PDF, PNG, JPEG or CSV file of at most 8 MB.');
  const record = await getService('storage').put({
    companyId,
    category: 'attachment',
    name: parsed.data.name,
    bytes,
    mimeType: parsed.data.mimeType,
  });
  const { data, error } = await getAdminSupabase()
    .from('asset_documents')
    .insert({
      company_id: companyId,
      asset_id: assetId,
      file_id: record.id,
      name: parsed.data.name,
      created_by: actor.userId,
    })
    .select('id, name')
    .single();
  if (error) throw new InternalError(error);
  await getService('audit').record({
    action: 'asset.document_added',
    resourceType: 'fixed_asset',
    resourceId: assetId,
    companyId,
    metadata: { name: parsed.data.name, sha256: createHash('sha256').update(bytes).digest('hex') },
  });
  return { id: String(data.id), name: String(data.name) };
}

export async function assetDocumentLink(companyId: string, id: string): Promise<string> {
  const { data, error } = await getAdminSupabase()
    .from('asset_documents')
    .select('file_id')
    .eq('company_id', companyId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new InternalError(error);
  if (!data) throw new NotFoundError();
  return getService('storage').signedUrl(String(data.file_id), 300);
}

/** First day of the month an asset starts to depreciate. */
export const startMonth = (a: Pick<AssetView, 'inServiceDate'>): string =>
  monthStart(a.inServiceDate);
