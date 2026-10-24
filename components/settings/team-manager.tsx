// path: components/settings/team-manager.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { STAFF_PRESETS, type MatrixRow } from '@/lib/team/presets';
import { t } from '@/lib/i18n';
import type { InvitationView } from '@/services/team/invitations';
import type { MemberView, SeatState } from '@/services/team/members';

const errorBody = z.object({
  error: z.object({ message: z.string(), code: z.string().optional() }),
});
const activityBody = z.object({
  data: z.array(z.object({ at: z.string(), action: z.string(), resourceType: z.string() })),
});

interface Props {
  members: MemberView[];
  invitations: InvitationView[];
  seats: SeatState;
  matrix: MatrixRow[];
  /** Preset key to the exact actions it stands for today. */
  presets: Record<string, string[]>;
  canManage: boolean;
  canPermissions: boolean;
}

export function TeamManager({
  members,
  invitations,
  seats,
  matrix,
  presets,
  canManage,
  canPermissions,
}: Props): JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [preset, setPreset] = useState('viewer');
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [activity, setActivity] = useState<
    { at: string; action: string; resourceType: string }[] | null
  >(null);

  async function call(method: string, url: string, body?: unknown): Promise<Response | null> {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.ok) {
        router.refresh();
        return response;
      }
      const err = errorBody.safeParse(await response.json().catch(() => null));
      setMessage(
        err.success && err.data.error.code === 'conflict'
          ? t('s07Company.team.conflict')
          : err.success
            ? err.data.error.message
            : t('s07Company.team.error'),
      );
    } catch {
      setMessage(t('s07Company.team.error'));
    } finally {
      setBusy(false);
    }
    return null;
  }

  async function showActivity(userId: string): Promise<void> {
    setActivity(null);
    const response = await fetch(`/api/team/activity?userId=${userId}`);
    const parsed = activityBody.safeParse(await response.json().catch(() => null));
    setActivity(parsed.success ? parsed.data.data : []);
  }

  const staff = members.filter((m) => m.role === 'staff');
  const seatText =
    seats.limit === null
      ? t('s07Company.team.seatsUnlimited', { used: seats.used })
      : t('s07Company.team.seats', { used: seats.used, limit: seats.limit });
  return (
    <div className="space-y-sp-24">
      <section aria-labelledby="seats" className="rounded-lg border bg-card p-sp-16">
        <h2 id="seats" className="text-h4 font-semibold">
          {t('s07Company.team.seatsTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">{seatText}</p>
        {seats.limit !== null && seats.used >= seats.limit ? (
          <p role="alert" className="mt-1 text-sm text-destructive">
            {t('s07Company.team.seatsFull')}
          </p>
        ) : null}
      </section>

      {canManage ? (
        <form
          className="space-y-sp-12 rounded-lg border p-sp-16"
          onSubmit={(e) => {
            e.preventDefault();
            void call('POST', '/api/team/invitations', { email, preset, grants: [] }).then((r) => {
              if (r) setEmail('');
            });
          }}
        >
          <h2 className="text-h4 font-semibold">{t('s07Company.team.inviteTitle')}</h2>
          <div className="grid gap-sp-12 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>{t('s07Company.team.email')}</span>
              <Input
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('s07Company.team.preset')}</span>
              <select
                className="h-11 w-full rounded-md border bg-background px-3 text-base"
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
              >
                {STAFF_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label} - {p.summary}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-caption text-muted-foreground">
            {t('s07Company.team.presetHelp', { count: (presets[preset] ?? []).length })}
          </p>
          <Button type="submit" disabled={busy || !email}>
            {t('s07Company.team.sendInvite')}
          </Button>
        </form>
      ) : null}

      <section aria-labelledby="inv" className="space-y-sp-12">
        <h2 id="inv" className="text-h4 font-semibold">
          {t('s07Company.team.invitations')}
        </h2>
        {invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('s07Company.team.noInvitations')}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-2 p-sp-12 text-sm">
                <span className="font-medium">{i.email}</span>
                <Badge variant="outline">{t(`s07Company.team.invStatus.${i.status}`)}</Badge>
                <span className="text-muted-foreground">
                  {t('s07Company.team.expires', { date: i.expiresAt.slice(0, 10) })}
                </span>
                {canManage && (i.status === 'pending' || i.status === 'expired') ? (
                  <span className="ml-auto flex gap-2">
                    {i.status === 'pending' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void call('PUT', '/api/team/invitations', { action: 'resend', id: i.id })
                        }
                      >
                        {t('s07Company.team.resend')}
                      </Button>
                    ) : null}
                    {i.status === 'pending' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void call('PUT', '/api/team/invitations', { action: 'cancel', id: i.id })
                        }
                      >
                        {t('s07Company.team.cancel')}
                      </Button>
                    ) : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="staff" className="space-y-sp-12">
        <h2 id="staff" className="text-h4 font-semibold">
          {t('s07Company.team.staff')}
        </h2>
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('s07Company.team.noStaff')}</p>
        ) : (
          <ul className="space-y-sp-12">
            {staff.map((m) => (
              <li key={m.id} className="space-y-2 rounded-lg border p-sp-12 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.name || m.email}</span>
                  <span className="text-muted-foreground">{m.email}</span>
                  <Badge variant={m.status === 'active' ? 'outline' : 'destructive'}>
                    {t(`s07Company.team.status.${m.status === 'active' ? 'active' : 'suspended'}`)}
                  </Badge>
                  <span className="ml-auto flex flex-wrap gap-2">
                    {canPermissions ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setOpen(open === m.id ? null : m.id);
                          setDraft(m.grants);
                          setActivity(null);
                        }}
                      >
                        {t('s07Company.team.permissions')}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setOpen(open === `a-${m.id}` ? null : `a-${m.id}`);
                        void showActivity(m.userId);
                      }}
                    >
                      {t('s07Company.team.activity')}
                    </Button>
                    {canManage ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void call('PATCH', '/api/team/members', {
                              id: m.id,
                              expectedVersion: m.version,
                              status: m.status === 'active' ? 'suspended' : 'active',
                            })
                          }
                        >
                          {m.status === 'active'
                            ? t('s07Company.team.deactivate')
                            : t('s07Company.team.reactivate')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            if (window.confirm(t('s07Company.team.confirmRemove')))
                              void call('PATCH', '/api/team/members', {
                                id: m.id,
                                expectedVersion: m.version,
                                status: 'removed',
                              });
                          }}
                        >
                          {t('s07Company.team.remove')}
                        </Button>
                      </>
                    ) : null}
                  </span>
                </div>
                {open === m.id ? (
                  <div className="space-y-sp-12 rounded-md bg-muted/40 p-sp-12">
                    <div className="flex flex-wrap gap-2">
                      {STAFF_PRESETS.map((p) => (
                        <Button
                          key={p.key}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setDraft(presets[p.key] ?? [])}
                        >
                          {p.label}
                        </Button>
                      ))}
                      <Button type="button" size="sm" variant="ghost" onClick={() => setDraft([])}>
                        {t('s07Company.team.clearAll')}
                      </Button>
                    </div>
                    {matrix.length === 0 ? (
                      <p className="text-muted-foreground">{t('s07Company.team.noPermissions')}</p>
                    ) : (
                      matrix.map((row) => (
                        <fieldset key={row.domain} className="space-y-1">
                          <legend className="font-medium capitalize">{row.domain}</legend>
                          <div className="grid gap-1 sm:grid-cols-2">
                            {row.actions.map((a) => (
                              <label key={a.action} className="flex items-start gap-2">
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={draft.includes(a.action)}
                                  onChange={(e) =>
                                    setDraft(
                                      e.target.checked
                                        ? [...draft, a.action]
                                        : draft.filter((x) => x !== a.action),
                                    )
                                  }
                                />
                                <span>
                                  {a.action}
                                  <span className="block text-caption text-muted-foreground">
                                    {a.description}
                                  </span>
                                </span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ))
                    )}
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void call('PUT', '/api/team/members', {
                          id: m.id,
                          expectedVersion: m.version,
                          grants: draft,
                        }).then((r) => {
                          if (r) setOpen(null);
                        })
                      }
                    >
                      {t('s07Company.team.savePermissions')}
                    </Button>
                  </div>
                ) : null}
                {open === `a-${m.id}` ? (
                  <div className="rounded-md bg-muted/40 p-sp-12">
                    {activity === null ? (
                      <p>{t('s07Company.team.loading')}</p>
                    ) : activity.length === 0 ? (
                      <p>{t('s07Company.team.noActivity')}</p>
                    ) : (
                      <ul className="space-y-1">
                        {activity.map((a, i) => (
                          <li key={i}>
                            <span className="text-muted-foreground">
                              {a.at.replace('T', ' ').slice(0, 16)}
                            </span>{' '}
                            {a.action}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p aria-live="polite" className="text-sm text-destructive">
        {message}
      </p>
    </div>
  );
}
