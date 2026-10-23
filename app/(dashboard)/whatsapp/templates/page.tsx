// path: app/(dashboard)/whatsapp/templates/page.tsx
import type { Metadata } from 'next';
import { ActionButton } from '@/app/(dashboard)/wallet/_components/action-button';
import { JsonForm } from '@/app/(dashboard)/wallet/_components/json-form';
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
import { t, type StringKey } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { listTemplates, type TemplateView } from '@/services/whatsapp/templates';
import { WhatsAppTabs } from '../tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'WhatsApp templates' };

export default async function WhatsAppTemplatesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('whatsapp.read', 'tenant', 'whatsapp_template');
  const canManage = await getService('permissions').can(actor, 'whatsapp.manage', {
    type: 'whatsapp_template',
  });
  let templates: TemplateView[] | null;
  try {
    templates = await listTemplates(actor.companyId as string);
  } catch {
    templates = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Whatsapp.templates.title')}
        description={t('s16Whatsapp.templates.description')}
        actions={<WhatsAppTabs current="/whatsapp/templates" />}
      />
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Whatsapp.templates.newTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-sp-12">
            <p className="text-sm text-muted-foreground">
              {t('s16Whatsapp.templates.sandboxNote')}
            </p>
            <JsonForm
              endpoint="/api/whatsapp/templates"
              idempotent
              resetAfter
              submitLabel={t('s16Whatsapp.templates.make')}
              doneText={t('s16Whatsapp.common.done')}
              fields={[
                { name: 'name', label: t('s16Whatsapp.templates.name'), required: true },
                {
                  name: 'language',
                  label: t('s16Whatsapp.templates.language'),
                  initial: 'en_US',
                  required: true,
                },
                {
                  name: 'category',
                  label: t('s16Whatsapp.templates.category'),
                  kind: 'select',
                  initial: 'utility',
                  options: (['utility', 'marketing', 'authentication'] as const).map((c) => ({
                    value: c,
                    label: t(`s16Whatsapp.templates.categories.${c}` as StringKey),
                  })),
                },
                {
                  name: 'parameterFormat',
                  label: t('s16Whatsapp.templates.format'),
                  kind: 'select',
                  initial: 'positional',
                  options: (['positional', 'named'] as const).map((c) => ({
                    value: c,
                    label: t(`s16Whatsapp.templates.formats.${c}` as StringKey),
                  })),
                },
                { name: 'header', label: t('s16Whatsapp.templates.header') },
                { name: 'headerExample', label: t('s16Whatsapp.templates.headerExample') },
                { name: 'body', label: t('s16Whatsapp.templates.body'), required: true },
                { name: 'bodyExamples', label: t('s16Whatsapp.templates.examples'), list: true },
                { name: 'footer', label: t('s16Whatsapp.templates.footer') },
              ]}
            />
            <ActionButton
              endpoint="/api/whatsapp/templates/sync"
              label={t('s16Whatsapp.templates.sync')}
              doneText={t('s16Whatsapp.templates.synced')}
            />
          </CardContent>
        </Card>
      ) : null}
      {templates === null ? (
        <ErrorState description={t('s16Whatsapp.common.loadError')} />
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s16Whatsapp.templates.empty')}</p>
      ) : (
        <Card>
          <CardContent className="pt-sp-16">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Whatsapp.templates.columns.name')}</TableHead>
                  <TableHead>{t('s16Whatsapp.templates.columns.language')}</TableHead>
                  <TableHead>{t('s16Whatsapp.templates.columns.category')}</TableHead>
                  <TableHead>{t('s16Whatsapp.templates.columns.status')}</TableHead>
                  <TableHead>{t('s16Whatsapp.templates.columns.text')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-mono text-xs">{x.name}</TableCell>
                    <TableCell>{x.language}</TableCell>
                    <TableCell>
                      {t(`s16Whatsapp.templates.categories.${x.category}` as StringKey)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{x.status}</Badge>
                      {x.rejectReason ? (
                        <span className="block text-xs text-muted-foreground">
                          {x.rejectReason}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-md text-sm">{x.body}</TableCell>
                    <TableCell>
                      {canManage ? (
                        <ActionButton
                          endpoint={`/api/whatsapp/templates/${x.id}`}
                          method="DELETE"
                          variant="destructive"
                          label={t('s16Whatsapp.templates.remove')}
                          doneText={t('s16Whatsapp.templates.removed')}
                        />
                      ) : null}
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
