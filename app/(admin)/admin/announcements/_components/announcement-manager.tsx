// path: app/(admin)/admin/announcements/_components/announcement-manager.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';
import type { AnnouncementView } from '@/services/company/announcements';
import { sendJson } from '../../_components/post-json';

const p = (k: string): string => t(`s07Company.adminOps.${k}` as never);
const local = (d: Date): string => d.toISOString().slice(0, 16);

function state(a: AnnouncementView, now: number): string {
  if (a.status === 'withdrawn') return p('withdrawn');
  if (Date.parse(a.endsAt) <= now) return p('ended');
  if (Date.parse(a.startsAt) > now) return p('scheduled');
  return p('live');
}

export function AnnouncementManager({
  items,
  nowIso,
}: {
  items: AnnouncementView[];
  nowIso: string;
}): JSX.Element {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({
    title: '',
    body: '',
    kind: 'info',
    audience: 'all',
    startsAt: local(new Date(nowIso)),
    endsAt: local(new Date(Date.parse(nowIso) + 86_400_000)),
  });

  async function run(body: Record<string, unknown>): Promise<void> {
    setMessage(null);
    const error = await sendJson('/api/companies/admin/announcements', 'POST', body);
    if (error) setMessage({ ok: false, text: error });
    else {
      setMessage({ ok: true, text: p('done') });
      if (body.action === 'publish') setForm({ ...form, title: '', body: '' });
      router.refresh();
    }
  }

  const now = Date.parse(nowIso);
  return (
    <div className="space-y-sp-16">
      <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
        <label className="block text-sm">
          <span className="block font-medium">{p('announcementTitle')}</span>
          <Input
            value={form.title}
            maxLength={120}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="block font-medium">{p('announcementBody')}</span>
          <Textarea
            value={form.body}
            maxLength={2000}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </label>
        <div className="grid gap-sp-8 sm:grid-cols-4">
          <label className="text-sm">
            <span className="block font-medium">{p('kind')}</span>
            <NativeSelect
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
            >
              <option value="info">{p('kindInfo')}</option>
              <option value="maintenance">{p('kindMaintenance')}</option>
              <option value="warning">{p('kindWarning')}</option>
            </NativeSelect>
          </label>
          <label className="text-sm">
            <span className="block font-medium">{p('audience')}</span>
            <NativeSelect
              value={form.audience}
              onChange={(e) => setForm({ ...form, audience: e.target.value })}
            >
              <option value="all">{p('audienceAll')}</option>
              <option value="owners">{p('audienceOwners')}</option>
            </NativeSelect>
          </label>
          <label className="text-sm">
            <span className="block font-medium">{p('startsAt')}</span>
            <Input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </label>
          <label className="text-sm">
            <span className="block font-medium">{p('endsAt')}</span>
            <Input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />
          </label>
        </div>
        <Button
          type="button"
          disabled={!form.title.trim() || !form.body.trim()}
          onClick={() =>
            void run({
              action: 'publish',
              ...form,
              startsAt: new Date(`${form.startsAt}:00Z`).toISOString(),
              endsAt: new Date(`${form.endsAt}:00Z`).toISOString(),
            })
          }
        >
          {p('publish')}
        </Button>
      </section>
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {message.text}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{p('noAnnouncements')}</p>
      ) : (
        <ul className="space-y-sp-8">
          {items.map((a) => (
            <li key={a.id} className="space-y-1 rounded-lg border bg-card p-sp-12 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-sp-8">
                <p className="font-medium">{a.title}</p>
                <Badge variant="outline">{state(a, now)}</Badge>
              </div>
              <p className="whitespace-pre-wrap break-words">{a.body}</p>
              <p className="text-muted-foreground">
                {a.startsAt.slice(0, 16).replace('T', ' ')} -{' '}
                {a.endsAt.slice(0, 16).replace('T', ' ')}
              </p>
              {a.status === 'published' && Date.parse(a.endsAt) > now ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void run({ action: 'withdraw', id: a.id })}
                >
                  {p('withdraw')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
