// path: components/settings/section-page.tsx
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { getService } from '@/lib/container';
import type { EditableSection } from '@/lib/company/forms';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { planHas } from '@/services/company/plan';
import { getSection } from '@/services/company/settings';
import { LogoPanel } from './logo-panel';
import { SectionForm } from './section-form';
import { SettingsTabs } from './settings-tabs';

type Tab = 'company' | 'branding' | 'invoicing' | 'notifications' | 'display';

/** One company settings screen: title, tabs, and the generic form for the section. */
export async function SectionPage({
  section,
  tab,
}: {
  section: EditableSection;
  tab: Tab;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('company.read', 'tenant', 'company');
  const canEdit = await getService('permissions').can(actor, 'company.manage', { type: 'company' });
  let data: Awaited<ReturnType<typeof getSection>> | null;
  let multiCurrency = true;
  try {
    data = actor.companyId ? await getSection(actor.companyId, section) : null;
    if (section === 'display' && actor.companyId)
      multiCurrency = await planHas(actor.companyId, 'display.multi_currency');
  } catch {
    data = null;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader
        title={t(`s07Company.settings.titles.${tab}` as StringKey)}
        description={t(`s07Company.settings.descriptions.${tab}` as StringKey)}
      />
      <SettingsTabs current={tab} />
      {data === null ? (
        <ErrorState description={t('s07Company.settings.loadError')} />
      ) : (
        <>
          {!canEdit ? (
            <p className="rounded-md border bg-muted/40 p-sp-12 text-sm">
              {t('s07Company.settings.readOnly')}
            </p>
          ) : null}
          <SectionForm
            key={data.version}
            section={section}
            initial={data.value as unknown as Record<string, never>}
            version={data.version}
            disabled={!canEdit}
            lockedFields={multiCurrency ? [] : ['displayCurrencies']}
            extra={
              section === 'branding' ? (
                <LogoPanel
                  hasLogo={(data.value as { logoFileId: string | null }).logoFileId !== null}
                />
              ) : undefined
            }
          />
        </>
      )}
    </div>
  );
}
