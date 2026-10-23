// path: app/(dashboard)/developers/keys/[id]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PageHeader } from '@/components/shared/page-header';
import { ErrorState } from '@/components/shared/state-views';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { NotFoundError } from '@/lib/errors';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getKey, type KeyView } from '@/services/publicapi/keys';
import { usageOfKey, type UsageDay } from '@/services/publicapi/usage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'API key' };

export default async function KeyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requirePagePermission('integrations.apikey.read', 'tenant', 'api_key');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const companyId = actor.companyId as string;
  let data: { key: KeyView; usage: UsageDay[] } | null;
  try {
    const [key, usage] = await Promise.all([getKey(companyId, id), usageOfKey(companyId, id, 30)]);
    data = { key, usage };
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={data ? data.key.name : t('s16Developers.keys.title')}
        description={data ? data.key.masked : undefined}
        actions={
          <Button asChild variant="outline">
            <Link href="/developers" prefetch={false}>
              {t('s16Developers.keys.back')}
            </Link>
          </Button>
        }
      />
      {data === null ? (
        <ErrorState description={t('s16Developers.common.loadError')} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {t('s16Developers.keys.details')}
                <Badge variant="outline">
                  {t(`s16Developers.keys.states.${data.key.state}` as StringKey)}
                </Badge>
                <Badge variant="outline">
                  {t(`s16Developers.keys.modes.${data.key.mode}` as StringKey)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                {t('s16Developers.keys.limitLabel')}: {data.key.rateLimitPerMinute}
              </p>
              <p>
                {t('s16Developers.keys.columns.expires')}:{' '}
                {data.key.expiresAt
                  ? data.key.expiresAt.slice(0, 10)
                  : t('s16Developers.keys.never')}
              </p>
              <p>{t('s16Developers.keys.scopesLabel')}:</p>
              <ul className="list-disc pl-5">
                {data.key.scopes.map((s) => (
                  <li key={s}>{t(`s16Developers.scopes.${s}` as StringKey)}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Developers.keys.usageTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.usage.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('s16Developers.keys.usageEmpty')}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('s16Developers.keys.usageColumns.day')}</TableHead>
                      <TableHead>{t('s16Developers.keys.usageColumns.requests')}</TableHead>
                      <TableHead>{t('s16Developers.keys.usageColumns.errors')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.usage.map((u) => (
                      <TableRow key={u.day}>
                        <TableCell>{u.day}</TableCell>
                        <TableCell className="tabular-nums">{u.requests}</TableCell>
                        <TableCell className="tabular-nums">{u.errors}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
