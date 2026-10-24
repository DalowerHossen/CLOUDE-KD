// path: app/(dashboard)/developers/docs/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
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
import { ENDPOINTS } from '@/lib/integrations/public-registry';
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'API documentation' };

const SECTIONS = [
  ['authTitle', 'authBody'],
  ['limitsTitle', 'limitsBody'],
  ['paginationTitle', 'paginationBody'],
  ['idempotencyTitle', 'idempotencyBody'],
  ['sandboxTitle', 'sandboxBody'],
  ['errorsTitle', 'errorsBody'],
  ['moneyTitle', 'moneyBody'],
] as const;

export default async function ApiDocsPage(): Promise<JSX.Element> {
  await requirePagePermission('integrations.apikey.read', 'tenant', 'api_key');
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Developers.docs.title')}
        description={t('s16Developers.docs.description')}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/developers" prefetch={false}>
                {t('s16Developers.keys.back')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href="/api/public/v1/openapi.json">{t('s16Developers.keys.openapiLink')}</a>
            </Button>
          </>
        }
      />
      {SECTIONS.map(([title, body]) => (
        <Card key={title}>
          <CardHeader>
            <CardTitle>{t(`s16Developers.docs.${title}` as StringKey)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {t(`s16Developers.docs.${body}` as StringKey)}
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Developers.docs.endpointsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('s16Developers.docs.columns.method')}</TableHead>
                <TableHead>{t('s16Developers.docs.columns.path')}</TableHead>
                <TableHead>{t('s16Developers.docs.columns.scope')}</TableHead>
                <TableHead>{t('s16Developers.docs.columns.summary')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ENDPOINTS.map((e) => (
                <TableRow key={e.operationId}>
                  <TableCell className="font-mono text-xs uppercase">{e.method}</TableCell>
                  <TableCell className="font-mono text-xs">/api/public/v1{e.path}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {e.scope ?? t('s16Developers.docs.open')}
                  </TableCell>
                  <TableCell>{e.summary}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Developers.docs.changelogTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">{t('s16Developers.docs.changelog.v100')}</CardContent>
      </Card>
    </div>
  );
}
