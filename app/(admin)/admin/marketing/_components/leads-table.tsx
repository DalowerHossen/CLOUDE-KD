// path: app/(admin)/admin/marketing/_components/leads-table.tsx
'use client';
import { NativeSelect } from '@/components/ui/native-select';
import { t } from '@/lib/i18n';
import type { LeadRow } from '@/services/marketing/leads';
import { useCall } from './use-call';

const STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost', 'unsubscribed'] as const;

export function LeadsTable({ rows, canEdit }: { rows: LeadRow[]; canEdit: boolean }): JSX.Element {
  const { busy, message, call } = useCall();
  return (
    <section className="space-y-sp-12" aria-labelledby="leads-title">
      <h2 id="leads-title" className="text-h3 font-semibold">
        {t('s06Public.marketingAdmin.leads')}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('s06Public.marketingAdmin.noLeads')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('s06Public.marketingAdmin.leads')}</caption>
            <thead>
              <tr className="border-b text-left">
                <th className="p-2">{t('s06Public.contact.email')}</th>
                <th className="p-2">{t('s06Public.blogAdmin.name')}</th>
                <th className="p-2">{t('s06Public.marketingAdmin.source')}</th>
                <th className="p-2">{t('s06Public.marketingAdmin.emails')}</th>
                <th className="p-2">{t('s06Public.cms.colState')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2">{r.email}</td>
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">{r.source}</td>
                  <td className="p-2">
                    {r.marketingOk ? t('s06Public.marketingAdmin.agreed') : '-'}
                  </td>
                  <td className="p-2">
                    <NativeSelect
                      aria-label={t('s06Public.cms.colState')}
                      value={r.status}
                      disabled={busy || !canEdit}
                      onChange={(e) =>
                        void call('POST', '/api/marketing/leads', {
                          id: r.id,
                          status: e.target.value,
                          note: r.note,
                        })
                      }
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </NativeSelect>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {message}
      </p>
    </section>
  );
}
