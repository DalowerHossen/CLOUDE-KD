// path: app/(admin)/admin/marketing/_components/campaigns-manager.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';
import type { CampaignRow } from '@/services/marketing/admin';
import { useCall } from './use-call';

export function CampaignsManager({
  rows,
  canEdit,
  canSend,
}: {
  rows: CampaignRow[];
  canEdit: boolean;
  canSend: boolean;
}): JSX.Element {
  const { busy, message, call } = useCall();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [testTo, setTestTo] = useState('');
  return (
    <section className="space-y-sp-12" aria-labelledby="camp-title">
      <h2 id="camp-title" className="text-h3 font-semibold">
        {t('s06Public.marketingAdmin.campaigns')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('s06Public.marketingAdmin.campaignsHelp')}</p>
      <ul className="divide-y rounded-lg border">
        {rows.map((r) => (
          <li key={r.id} className="space-y-1 p-sp-12 text-sm">
            <p className="font-medium">
              {r.name} - {r.subject}
            </p>
            <p className="text-muted-foreground">
              {r.status}
              {r.status === 'sent' ? ` - ${r.recipientCount}` : ''}
            </p>
            {r.status === 'draft' && canSend ? (
              <div className="flex flex-wrap items-end gap-2">
                <Input
                  aria-label={t('s06Public.marketingAdmin.testTo')}
                  placeholder={t('s06Public.marketingAdmin.testTo')}
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  className="max-w-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || !testTo}
                  onClick={() =>
                    void call('PUT', '/api/marketing/campaigns', {
                      action: 'test',
                      id: r.id,
                      to: testTo,
                    })
                  }
                >
                  {t('s06Public.marketingAdmin.sendTest')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t('s06Public.marketingAdmin.confirmSend')))
                      void call('PUT', '/api/marketing/campaigns', { action: 'send', id: r.id });
                  }}
                >
                  {t('s06Public.marketingAdmin.send')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void call('PUT', '/api/marketing/campaigns', { action: 'delete', id: r.id })
                  }
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
          className="space-y-sp-12"
          onSubmit={(e) => {
            e.preventDefault();
            void call('POST', '/api/marketing/campaigns', {
              id: null,
              name,
              subject,
              bodyText: body,
            }).then((ok) => {
              if (ok) {
                setName('');
                setSubject('');
                setBody('');
              }
            });
          }}
        >
          <label className="block space-y-1 text-sm">
            <span>{t('s06Public.blogAdmin.name')}</span>
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t('s06Public.marketingAdmin.subject')}</span>
            <Input value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{t('s06Public.marketingAdmin.body')}</span>
            <Textarea
              value={body}
              rows={6}
              maxLength={8000}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <Button
            type="submit"
            disabled={busy || name.length < 3 || subject.length < 3 || body.length < 10}
          >
            {t('s06Public.cms.save')}
          </Button>
        </form>
      ) : null}
      <p aria-live="polite" className="text-caption text-muted-foreground">
        {message}
      </p>
    </section>
  );
}
