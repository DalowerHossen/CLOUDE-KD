// path: app/(admin)/admin/compliance/restrictions/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { CountryForm } from '@/components/compliance/country-form';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listRestrictions, type CountryRestrictionView } from '@/services/compliance/countries';
import { sourceStatus, type SourceStatus } from '@/services/compliance/sanctions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Country restrictions and sanctions' };

const utc = (v: string | null): string => (v ? v.replace('T', ' ').slice(0, 16) : '-');

export default async function RestrictionsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('compliance.read', 'platform', 'country_restriction');
  const canManage = await getService('permissions').can(actor, 'compliance.manage', {
    type: 'country_restriction',
  });
  let countries: CountryRestrictionView[] | null;
  let lists: SourceStatus[] | null;
  try {
    [countries, lists] = await Promise.all([listRestrictions(), sourceStatus()]);
  } catch {
    countries = null;
    lists = null;
  }
  return (
    <div className="space-y-sp-16">
      <PageHeader
        title={t('s16Compliance.page.title')}
        description={t('s16Compliance.page.description')}
      />
      {countries === null || lists === null ? (
        <ErrorState description={t('s16Compliance.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Compliance.page.countriesTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('s16Compliance.page.countriesHelp')}
              </p>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              {countries.length === 0 ? (
                <p>{t('s16Compliance.page.empty')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('s16Compliance.page.country')}</TableHead>
                      <TableHead>{t('s16Compliance.page.mode')}</TableHead>
                      <TableHead>{t('s16Compliance.page.source')}</TableHead>
                      <TableHead>{t('s16Compliance.page.reason')}</TableHead>
                      <TableHead>{t('s16Compliance.page.state')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {countries.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.countryCode}</TableCell>
                        <TableCell>{t(`s16Compliance.page.modes.${c.mode}`)}</TableCell>
                        <TableCell>
                          {t(`s16Compliance.page.sources.${c.source}`)}
                          {c.reference ? ` (${c.reference})` : ''}
                        </TableCell>
                        <TableCell>{c.reason}</TableCell>
                        <TableCell>
                          <Badge variant={c.enabled ? 'destructive' : 'outline'}>
                            {c.enabled ? t('s16Compliance.page.on') : t('s16Compliance.page.off')}
                          </Badge>
                        </TableCell>
                        <TableCell className="space-x-sp-8">
                          {canManage ? (
                            <>
                              <ActionButton
                                endpoint={`/api/admin/compliance/countries/${c.id}`}
                                method="PATCH"
                                body={{ enabled: !c.enabled, version: c.version }}
                                label={
                                  c.enabled
                                    ? t('s16Compliance.page.turnOff')
                                    : t('s16Compliance.page.turnOn')
                                }
                                doneText={t('s16Compliance.page.changed')}
                              />
                              <ActionButton
                                endpoint={`/api/admin/compliance/countries/${c.id}`}
                                method="DELETE"
                                label={t('s16Compliance.page.remove')}
                                doneText={t('s16Compliance.page.removed')}
                                variant="destructive"
                              />
                            </>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {canManage ? <CountryForm /> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Compliance.page.sanctionsTitle')}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {t('s16Compliance.page.sanctionsHelp')}
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('s16Compliance.page.list')}</TableHead>
                    <TableHead>{t('s16Compliance.page.entries')}</TableHead>
                    <TableHead>{t('s16Compliance.page.importedAt')}</TableHead>
                    <TableHead>{t('s16Compliance.page.note')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(['ofac', 'un'] as const).map((id) => {
                    const row = lists.find((l) => l.source === id);
                    return (
                      <TableRow key={id}>
                        <TableCell>{t(`s16Compliance.page.lists.${id}`)}</TableCell>
                        <TableCell>
                          {row ? row.entryCount : t('s16Compliance.page.notLoaded')}
                        </TableCell>
                        <TableCell>{utc(row?.importedAt ?? null)}</TableCell>
                        <TableCell>{row?.note || '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
