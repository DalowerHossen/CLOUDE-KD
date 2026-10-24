// path: app/(dashboard)/invoices/reminders/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { ReminderSettingsForm } from '@/components/dunning/reminder-settings-form';
import { PageHeader } from '@/components/shared/page-header';
import { getService } from '@/lib/container';
import { t } from '@/lib/i18n';
import { requirePagePermission } from '@/services/base/page-guard';
import { getReminderSettings } from '@/services/invoice/reminders';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment reminders' };

export default async function RemindersPage(): Promise<JSX.Element> {
  const actor = await requirePagePermission('invoice.read', 'tenant', 'reminder_settings');
  const [settings, canManage] = await Promise.all([
    getReminderSettings(actor.companyId as string),
    getService('permissions').can(actor, 'reminder.manage', { type: 'reminder_settings' }),
  ]);
  const { version, ...value } = settings;
  return (
    <div className="mx-auto max-w-3xl space-y-sp-16">
      <PageHeader
        title={t('s09Dunning.reminders.title')}
        description={t('s09Dunning.reminders.description')}
        actions={
          <Link className="underline" href="/invoices">
            {t('s09Dunning.back')}
          </Link>
        }
      />
      <ReminderSettingsForm initial={value} version={version} canManage={canManage} />
    </div>
  );
}
