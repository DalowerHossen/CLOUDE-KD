// path: app/(admin)/admin/marketing/_components/testimonials-manager.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';
import type { TestimonialRow } from '@/services/marketing/admin';
import { useCall } from './use-call';

export function TestimonialsManager({
  rows,
  canEdit,
}: {
  rows: TestimonialRow[];
  canEdit: boolean;
}): JSX.Element {
  const { busy, message, call } = useCall();
  const [quote, setQuote] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [org, setOrg] = useState('');
  const save = (row: Omit<TestimonialRow, 'id'> & { id: string | null }): Promise<boolean> =>
    call('POST', '/api/marketing/testimonials', row);
  return (
    <section className="space-y-sp-12" aria-labelledby="tm-title">
      <h2 id="tm-title" className="text-h3 font-semibold">
        {t('s06Public.marketingAdmin.testimonials')}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t('s06Public.marketingAdmin.testimonialsHelp')}
      </p>
      <ul className="divide-y rounded-lg border">
        {rows.map((r) => (
          <li key={r.id} className="space-y-1 p-sp-12 text-sm">
            <p>{`"${r.quote}"`}</p>
            <p className="text-muted-foreground">
              {r.personName}
              {r.personRole ? `, ${r.personRole}` : ''}
              {r.organization ? `, ${r.organization}` : ''}
            </p>
            {canEdit ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void save({ ...r, approved: !r.approved })}
                >
                  {r.approved
                    ? t('s06Public.marketingAdmin.hide')
                    : t('s06Public.marketingAdmin.approve')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void call('DELETE', `/api/marketing/testimonials?id=${r.id}`)}
                >
                  {t('s06Public.cms.remove')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className="grid gap-sp-12 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              id: null,
              quote,
              personName: name,
              personRole: role,
              organization: org,
              approved: false,
              sortOrder: rows.length,
            }).then((ok) => {
              if (ok) {
                setQuote('');
                setName('');
                setRole('');
                setOrg('');
              }
            });
          }}
        >
          <label className="space-y-1 text-sm sm:col-span-2">
            <span>{t('s06Public.marketingAdmin.quote')}</span>
            <Textarea
              value={quote}
              rows={3}
              maxLength={400}
              onChange={(e) => setQuote(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.blogAdmin.name')}</span>
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.marketingAdmin.role')}</span>
            <Input value={role} maxLength={80} onChange={(e) => setRole(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('s06Public.marketingAdmin.organization')}</span>
            <Input value={org} maxLength={80} onChange={(e) => setOrg(e.target.value)} />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={busy || quote.length < 10 || name.length < 2}>
              {t('s06Public.cms.create')}
            </Button>
          </div>
        </form>
      ) : null}
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {message}
      </p>
    </section>
  );
}
