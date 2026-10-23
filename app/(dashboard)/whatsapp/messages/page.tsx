// path: app/(dashboard)/whatsapp/messages/page.tsx
import type { Metadata } from 'next';
import { SendTemplateForm, SendTextForm } from '@/components/whatsapp/send-forms';
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
import { listMessages, type MessageView } from '@/services/whatsapp/send';
import { listTemplates } from '@/services/whatsapp/templates';
import { WhatsAppTabs } from '../tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'WhatsApp messages' };

export default async function WhatsAppMessagesPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('whatsapp.read', 'tenant', 'whatsapp_message');
  const companyId = actor.companyId as string;
  const canSend = await getService('permissions').can(actor, 'whatsapp.send', {
    type: 'whatsapp_message',
  });
  let data: {
    messages: MessageView[];
    templates: { id: string; label: string; variables: string[] }[];
  } | null;
  try {
    const [messages, templates] = await Promise.all([
      listMessages(companyId, { limit: 50 }),
      listTemplates(companyId),
    ]);
    data = {
      messages,
      templates: templates
        .filter((x) => x.status === 'APPROVED')
        .map((x) => ({ id: x.id, label: `${x.name} (${x.language})`, variables: x.variables })),
    };
  } catch {
    data = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Whatsapp.messages.title')}
        description={t('s16Whatsapp.messages.description')}
        actions={<WhatsAppTabs current="/whatsapp/messages" />}
      />
      {canSend && data ? (
        <div className="grid gap-sp-16 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Whatsapp.messages.textTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-sp-12">
              <p className="text-sm text-muted-foreground">{t('s16Whatsapp.messages.textHelp')}</p>
              <SendTextForm />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('s16Whatsapp.messages.templateTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <SendTemplateForm templates={data.templates} />
            </CardContent>
          </Card>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t('s16Whatsapp.messages.logTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data === null ? (
            <ErrorState description={t('s16Whatsapp.common.loadError')} />
          ) : data.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('s16Whatsapp.messages.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Whatsapp.messages.columns.when')}</TableHead>
                  <TableHead>{t('s16Whatsapp.messages.columns.person')}</TableHead>
                  <TableHead>{t('s16Whatsapp.messages.columns.direction')}</TableHead>
                  <TableHead>{t('s16Whatsapp.messages.columns.text')}</TableHead>
                  <TableHead>{t('s16Whatsapp.messages.columns.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.messages.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.createdAt.slice(0, 16).replace('T', ' ')}</TableCell>
                    <TableCell>
                      {m.phone}
                      {m.profileName ? (
                        <span className="block text-xs text-muted-foreground">{m.profileName}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {t(`s16Whatsapp.messages.directions.${m.direction}` as StringKey)}
                    </TableCell>
                    <TableCell className="max-w-md break-words text-sm">
                      {m.body || `(${m.type})`}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`s16Whatsapp.messages.statuses.${m.status}` as StringKey)}
                      </Badge>
                      {m.sandbox ? (
                        <span className="block text-xs text-muted-foreground">
                          {t('s16Whatsapp.messages.sandboxBadge')}
                        </span>
                      ) : null}
                      {m.errorText ? (
                        <span className="block text-xs text-muted-foreground">{m.errorText}</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
