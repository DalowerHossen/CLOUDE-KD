// path: services/asset/disposal.ts
// Selling or scrapping an asset. Depreciation is brought up to the month before the disposal, then one entry takes the asset off
// the books: proceeds in, accumulated depreciation cleared, cost removed and the gain or loss booked. Done once per asset.
import 'server-only';
import { getService } from '@/lib/container';
import { ConflictError, InternalError, NotFoundError, ValidationError } from '@/lib/errors';
import { getAdminSupabase } from '@/lib/supabase/admin';
import { Money } from '@/lib/utils/currency';
import type { Actor } from '@/types/contracts';
import { mapAccountingError } from '@/services/accounting/db-errors';
import { addMonthsToDay } from '@/services/accounting/period-rules';
import { getAsset, type AssetView } from './assets';
import { listAssetCategories } from './categories';
import { runDepreciation } from './depreciation';
import { disposalLines, disposeInput, monthStart } from './depreciation-rules';
import { postAssetEntry } from './entries';

export interface DisposalPreview {
  accumulated: string;
  netBookValue: string;
  proceeds: string;
  gainLoss: string;
}

export function previewDisposal(asset: AssetView, proceeds: string): DisposalPreview {
  const d = disposalLines(
    Money.parse(asset.cost),
    Money.parse(asset.accumulated),
    Money.parse(proceeds),
    asset.name,
  );
  return {
    accumulated: asset.accumulated,
    netBookValue: d.netBookValue.toDbString(),
    proceeds: Money.parse(proceeds).toDbString(),
    gainLoss: d.gainLoss.toDbString(),
  };
}

export async function disposeAsset(actor: Actor, id: string, input: unknown): Promise<AssetView> {
  const companyId = actor.companyId;
  if (!companyId) throw new ValidationError('A company is needed.');
  const parsed = disposeInput.safeParse(input);
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'The disposal is not valid.');
  const d = parsed.data;
  let asset = await getAsset(companyId, id);
  if (asset.status !== 'active') throw new ConflictError('This asset is already off the books.');
  if (d.disposedOn < asset.purchaseDate)
    throw new ValidationError('The disposal cannot be before the purchase.');
  await runDepreciation(companyId, addMonthsToDay(monthStart(d.disposedOn), -1));
  asset = await getAsset(companyId, id);
  const accumulated = Money.parse(asset.accumulated);
  const proceeds = Money.parse(d.proceeds);
  const categories = await listAssetCategories(companyId);
  const category = categories.find((c) => c.id === asset.categoryId);
  const plan = disposalLines(Money.parse(asset.cost), accumulated, proceeds, asset.name, {
    ...(category?.assetAccountId ? { asset: category.assetAccountId } : {}),
    ...(category?.accumulatedAccountId ? { accumulated: category.accumulatedAccountId } : {}),
  });
  const posted = await postAssetEntry({
    companyId,
    date: d.disposedOn,
    memo: `Disposal of ${asset.name}${d.note ? `: ${d.note}` : ''}`.slice(0, 500),
    sourceType: 'fixed_asset',
    sourceId: id,
    sourceKey: `asset-disposal:${id}`,
    lines: plan.lines,
  });
  const { data, error } = await getAdminSupabase()
    .from('fixed_assets')
    .update({
      status: proceeds.isPositive() ? 'sold' : 'disposed',
      disposed_on: d.disposedOn,
      disposal_proceeds: proceeds.toDbString(),
      disposal_gain_loss: plan.gainLoss.toDbString(),
      disposal_entry_id: posted.entryId,
    })
    .eq('company_id', companyId)
    .eq('id', id)
    .eq('version', asset.version)
    .eq('status', 'active')
    .select('id');
  if (error) mapAccountingError(error);
  if ((data ?? []).length === 0) throw new NotFoundError();
  await getService('audit').record({
    action: 'asset.disposed',
    resourceType: 'fixed_asset',
    resourceId: id,
    companyId,
    metadata: {
      disposedOn: d.disposedOn,
      proceeds: proceeds.toDbString(),
      gainLoss: plan.gainLoss.toDbString(),
    },
  });
  return getAsset(companyId, id);
}

export async function listDisposals(
  companyId: string,
  from: string,
  to: string,
): Promise<AssetView[]> {
  const { data, error } = await getAdminSupabase()
    .from('fixed_assets')
    .select('id')
    .eq('company_id', companyId)
    .neq('status', 'active')
    .is('deleted_at', null)
    .gte('disposed_on', from)
    .lte('disposed_on', to)
    .limit(5000);
  if (error) throw new InternalError(error);
  return Promise.all((data ?? []).map((r) => getAsset(companyId, String(r.id))));
}
