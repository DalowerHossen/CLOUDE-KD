// path: app/(dashboard)/whatsapp/contacts/page.tsx
import type { Metadata } from 'next';
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
import { listContacts, type ContactView } from '@/services/whatsapp/contacts';
import { WhatsAppTabs } from '../tabs';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'WhatsApp people' };

export default async function WhatsAppContactsPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('whatsapp.read', 'tenant', 'whatsapp_contact');
  const canManage = await getService('permissions').can(actor, 'whatsapp.contacts.manage', {
    type: 'whatsapp_contact',
  });
  let contacts: ContactView[] | null;
  try {
    contacts = await listContacts(actor.companyId as string, 200);
  } catch {
    contacts = null;
  }
  return (
    <div className="space-y-sp-24">
      <PageHeader
        title={t('s16Whatsapp.contacts.title')}
        description={t('s16Whatsapp.contacts.description')}
        actions={<WhatsAppTabs current="/whatsapp/contacts" />}
      />
      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('s16Whatsapp.contacts.recordTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonForm
              endpoint="/api/whatsapp/contacts/opt"
              idempotent
              resetAfter
              submitLabel={t('s16Whatsapp.contacts.record')}
              doneText={t('s16Whatsapp.common.done')}
              fields={[
                { name: 'phone', label: t('s16Whatsapp.contacts.phone'), required: true },
                {
                  name: 'status',
                  label: t('s16Whatsapp.contacts.status'),
                  kind: 'select',
                  initial: 'opted_in',
                  options: [
                    { value: 'opted_in', label: t('s16Whatsapp.contacts.optedIn') },
                    { value: 'opted_out', label: t('s16Whatsapp.contacts.optedOut') },
                  ],
                },
                { name: 'source', label: t('s16Whatsapp.contacts.source') },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}
      {contacts === null ? (
        <ErrorState description={t('s16Whatsapp.common.loadError')} />
      ) : contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s16Whatsapp.contacts.empty')}</p>
      ) : (
        <Card>
          <CardContent className="pt-sp-16">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('s16Whatsapp.contacts.columns.phone')}</TableHead>
                  <TableHead>{t('s16Whatsapp.contacts.columns.name')}</TableHead>
                  <TableHead>{t('s16Whatsapp.contacts.columns.status')}</TableHead>
                  <TableHead>{t('s16Whatsapp.contacts.columns.source')}</TableHead>
                  <TableHead>{t('s16Whatsapp.contacts.columns.changed')}</TableHead>
                  <TableHead>{t('s16Whatsapp.contacts.columns.lastMessage')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.phone}</TableCell>
                    <TableCell>{c.profileName || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`s16Whatsapp.contacts.states.${c.optStatus}` as StringKey)}
                      </Badge>
                    </TableCell>
                    <TableCell>{c.optSource || '-'}</TableCell>
                    <TableCell>{c.optChangedAt ? c.optChangedAt.slice(0, 10) : '-'}</TableCell>
                    <TableCell>
                      {c.lastInboundAt ? c.lastInboundAt.slice(0, 16).replace('T', ' ') : '-'}
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
