// path: app/(admin)/admin/security/_components/network-controls.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n';

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

async function send(
  method: 'POST' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.ok) return { ok: true, message: t('s04Security.security.saved') };
    const parsed = errorBody.safeParse(await response.json().catch(() => null));
    if (parsed.success && parsed.data.error.code === 'step_up_required')
      return { ok: false, message: t('s04Security.security.needStepUp') };
    return {
      ok: false,
      message: parsed.success ? parsed.data.error.message : t('s03Auth.common.genericError'),
    };
  } catch {
    return { ok: false, message: t('s03Auth.common.genericError') };
  }
}

export function AddWhitelist(): JSX.Element {
  const router = useRouter();
  const [cidr, setCidr] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="space-y-sp-12">
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="wl-cidr">{t('s04Security.security.cidr')}</Label>
          <Input
            id="wl-cidr"
            value={cidr}
            maxLength={64}
            onChange={(e) => setCidr(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wl-note">{t('s04Security.security.note')}</Label>
          <Input
            id="wl-note"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      <Button
        type="button"
        disabled={cidr.trim().length < 7}
        onClick={async () => {
          const r = await send('POST', '/api/admin/security/whitelist', { cidr, note });
          setMsg(r);
          if (r.ok) {
            setCidr('');
            setNote('');
            router.refresh();
          }
        }}
      >
        {t('s04Security.security.add')}
      </Button>
      <div aria-live="polite">
        {msg ? (
          <Alert variant={msg.ok ? 'success' : 'destructive'}>
            <div>{msg.message}</div>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

export function RemoveButton({ url, label }: { url: string; label: string }): JSX.Element {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          const r = await send('DELETE', url);
          if (r.ok) router.refresh();
          else setMsg(r.message);
        }}
      >
        {label}
      </Button>
      <p aria-live="polite" className="text-caption text-destructive">
        {msg}
      </p>
    </div>
  );
}

export function AddBlock(): JSX.Element {
  const router = useRouter();
  const [ip, setIp] = useState('');
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState('');
  const [permanent, setPermanent] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const hoursValue = hours.trim() === '' ? 24 : Number(hours);
  const valid =
    ip.trim().length >= 2 &&
    reason.trim().length >= 3 &&
    Number.isInteger(hoursValue) &&
    hoursValue >= 1 &&
    hoursValue <= 8760;
  return (
    <div className="space-y-sp-12">
      <div className="grid gap-sp-12 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="blk-ip">{t('s04Security.security.ip')}</Label>
          <Input id="blk-ip" value={ip} maxLength={64} onChange={(e) => setIp(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="blk-reason">{t('s04Security.security.reason')}</Label>
          <Input
            id="blk-reason"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="blk-hours">{t('s04Security.security.hours')}</Label>
          <Input
            id="blk-hours"
            inputMode="numeric"
            value={hours}
            maxLength={4}
            disabled={permanent}
            onChange={(e) => setHours(e.target.value)}
          />
        </div>
      </div>
      <div className="flex min-h-[44px] items-center gap-2">
        <Checkbox
          id="blk-perm"
          checked={permanent}
          onCheckedChange={(v) => setPermanent(v === true)}
        />
        <Label htmlFor="blk-perm">{t('s04Security.security.permanent')}</Label>
      </div>
      <Button
        type="button"
        disabled={!valid}
        onClick={async () => {
          const r = await send('POST', '/api/admin/security/blocks', {
            ip,
            reason,
            hours: permanent ? null : hoursValue,
            permanent,
          });
          setMsg(r);
          if (r.ok) {
            setIp('');
            setReason('');
            router.refresh();
          }
        }}
      >
        {t('s04Security.security.block')}
      </Button>
      <div aria-live="polite">
        {msg ? (
          <Alert variant={msg.ok ? 'success' : 'destructive'}>
            <div>{msg.message}</div>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
