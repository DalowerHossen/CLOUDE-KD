// path: app/(dashboard)/developers/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { CreateKeyForm, RotateKeyButton } from '@/components/developers/key-forms';
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
import { getService } from '@/lib/container';
import { ALL_SCOPES } from '@/lib/integrations/api-key-rules';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listKeys, type KeyView } from '@/services/publicapi/keys';

const keyPath = (id: string): string => ['/developers', 'keys', id].join('/');

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Developers' };

export default async function DevelopersPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('integrations.apikey.read', 'tenant', 'api_key');
  const canManage = await getService('permissions').can(actor, 'integrations.apikey.manage', {
    type: 'api_key',
  });
  let keys: KeyView[] | null;
  try {
    keys = await listKeys(actor.companyId as string);
  } catch {
    keys = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Developers.keys.title')}
        description={t('s16Developers.keys.description')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/developers/docs" prefetch={false}>
                {t('s16Developers.keys.docsLink')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href="/api/public/v1/openapi.json">{t('s16Developers.keys.openapiLink')}</a>
            </Button>
          </>
        }
      />
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Developers.keys.newTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateKeyForm scopes={ALL_SCOPES} />
          </CardContent>
        </Card>
      ) : null}
      {keys === null ? (
        <ErrorState description={t('s16Developers.common.loadError')} />
      ) : keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s16Developers.keys.empty')}</p>
      ) : (
        <Card>
          <CardContent className="pt-sp-16">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Developers.keys.columns.name')}</TableHead>
                  <TableHead>{t('s16Developers.keys.columns.key')}</TableHead>
                  <TableHead>{t('s16Developers.keys.columns.mode')}</TableHead>
                  <TableHead>{t('s16Developers.keys.columns.state')}</TableHead>
                  <TableHead>{t('s16Developers.keys.columns.lastUsed')}</TableHead>
                  <TableHead>{t('s16Developers.keys.columns.expires')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>{k.name}</TableCell>
                    <TableCell className="font-mono text-xs">{k.masked}</TableCell>
                    <TableCell>{t(`s16Developers.keys.modes.${k.mode}` as StringKey)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`s16Developers.keys.states.${k.state}` as StringKey)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {k.lastUsedAt ? k.lastUsedAt.slice(0, 16).replace('T', ' ') : '-'}
                    </TableCell>
                    <TableCell>
                      {k.expiresAt ? k.expiresAt.slice(0, 10) : t('s16Developers.keys.never')}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-start gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link href={keyPath(k.id)} prefetch={false}>
                            {t('s16Developers.keys.details')}
                          </Link>
                        </Button>
                        {canManage && k.state === 'active' ? (
                          <>
                            <RotateKeyButton id={k.id} />
                            <ActionButton
                              endpoint={`/api/integrations/keys/${k.id}`}
                              method="DELETE"
                              variant="destructive"
                              label={t('s16Developers.keys.revoke')}
                              doneText={t('s16Developers.keys.revoked')}
                            />
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
