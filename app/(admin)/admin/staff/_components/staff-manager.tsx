// path: app/(admin)/admin/staff/_components/staff-manager.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { WEEKDAYS } from '@/lib/company/ops-input';
import { t } from '@/lib/i18n';
import type { StaffView, ShiftView } from '@/services/team/admin-staff';
import { sendJson } from '../../_components/post-json';

const SUB_ROLES = [
  'kyc_reviewer',
  'payment_processor',
  'support_agent',
  'content_manager',
  'compliance_officer',
  'fraud_analyst',
  'finance_analyst',
] as const;
const label = (v: string): string => v.replace(/_/g, ' ');
const p = (k: string): string => t(`s07Company.adminOps.${k}` as never);

function StaffRow({
  staff,
  canManage,
  run,
}: {
  staff: StaffView;
  canManage: boolean;
  run: (body: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const [shifts, setShifts] = useState<ShiftView[]>(staff.shifts);
  return (
    <li className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
      <div className="flex flex-wrap items-center justify-between gap-sp-8">
        <div className="min-w-0">
          <p className="font-medium">{staff.name || staff.email}</p>
          <p className="break-all text-sm text-muted-foreground">{staff.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-sp-8">
          <Badge variant="outline">{staff.onDuty ? p('onDuty') : p('offDuty')}</Badge>
          {staff.status === 'disabled' ? (
            <Badge variant="outline">{p('suspendedNote')}</Badge>
          ) : null}
        </div>
      </div>
      {canManage ? (
        <>
          <div className="flex flex-wrap items-end gap-sp-8">
            <label className="text-sm">
              <span className="block font-medium">{p('subRole')}</span>
              <NativeSelect
                defaultValue={staff.subRole ?? ''}
                onChange={(e) =>
                  void run({ action: 'sub_role', userId: staff.userId, subRole: e.target.value })
                }
              >
                {SUB_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {label(r)}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => void run({ action: 'resend', userId: staff.userId })}
            >
              {p('resend')}
            </Button>
          </div>
          <fieldset className="space-y-sp-8">
            <legend className="text-sm font-medium">{p('shifts')}</legend>
            {shifts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{p('noShifts')}</p>
            ) : null}
            {shifts.map((s, i) => (
              <div key={i} className="flex flex-wrap items-end gap-sp-8">
                <label className="text-sm">
                  <span className="block">{p('weekday')}</span>
                  <NativeSelect
                    value={s.weekday}
                    onChange={(e) =>
                      setShifts(
                        shifts.map((x, j) =>
                          j === i ? { ...x, weekday: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  >
                    {WEEKDAYS.map((d, n) => (
                      <option key={d} value={n}>
                        {d}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
                <label className="text-sm">
                  <span className="block">{p('from')}</span>
                  <Input
                    type="time"
                    value={s.start}
                    onChange={(e) =>
                      setShifts(
                        shifts.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)),
                      )
                    }
                  />
                </label>
                <label className="text-sm">
                  <span className="block">{p('to')}</span>
                  <Input
                    type="time"
                    value={s.end}
                    onChange={(e) =>
                      setShifts(shifts.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
                    }
                  />
                </label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShifts(shifts.filter((_, j) => j !== i))}
                >
                  {p('removeShift')}
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-sp-8">
              <Button
                type="button"
                variant="outline"
                disabled={shifts.length >= 42}
                onClick={() => setShifts([...shifts, { weekday: 1, start: '09:00', end: '17:00' }])}
              >
                {p('addShift')}
              </Button>
              <Button
                type="button"
                onClick={() => void run({ action: 'shifts', userId: staff.userId, shifts })}
              >
                {p('saveShifts')}
              </Button>
            </div>
          </fieldset>
        </>
      ) : (
        <ul className="text-sm text-muted-foreground">
          {staff.shifts.map((s, i) => (
            <li key={i}>
              {WEEKDAYS[s.weekday]} {s.start} - {s.end}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function StaffManager({
  staff,
  canManage,
}: {
  staff: StaffView[];
  canManage: boolean;
}): JSX.Element {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ email: '', fullName: '', subRole: 'support_agent' });

  async function run(body: Record<string, unknown>): Promise<void> {
    setMessage(null);
    const error = await sendJson('/api/companies/admin/staff', 'POST', body);
    if (error) setMessage({ ok: false, text: error });
    else {
      setMessage({ ok: true, text: p('done') });
      if (body.action === 'create') setForm({ email: '', fullName: '', subRole: 'support_agent' });
      router.refresh();
    }
  }

  return (
    <div className="space-y-sp-16">
      {canManage ? (
        <section className="space-y-sp-8 rounded-lg border bg-card p-sp-16">
          <h2 className="text-h4 font-semibold">{p('newStaff')}</h2>
          <p className="text-sm text-muted-foreground">{p('createHelp')}</p>
          <div className="grid gap-sp-8 sm:grid-cols-3">
            <label className="text-sm">
              <span className="block font-medium">{p('fullName')}</span>
              <Input
                value={form.fullName}
                maxLength={200}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="block font-medium">{p('email')}</span>
              <Input
                type="email"
                value={form.email}
                maxLength={254}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="block font-medium">{p('subRole')}</span>
              <NativeSelect
                value={form.subRole}
                onChange={(e) => setForm({ ...form, subRole: e.target.value })}
              >
                {SUB_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {label(r)}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          <Button
            type="button"
            disabled={!form.email || !form.fullName.trim()}
            onClick={() => void run({ action: 'create', ...form })}
          >
            {p('create')}
          </Button>
        </section>
      ) : null}
      {message ? (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={message.ok ? 'text-sm' : 'text-sm text-destructive'}
        >
          {message.text}
        </p>
      ) : null}
      <ul className="space-y-sp-12">
        {staff.map((s) => (
          <StaffRow key={s.userId} staff={s} canManage={canManage} run={run} />
        ))}
      </ul>
    </div>
  );
}
