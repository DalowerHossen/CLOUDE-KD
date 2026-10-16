// path: services/team/admin-staff-duty.ts
// Who is on duty: weekly shifts in UTC. Pure functions, no server-only imports.
import { toMinutes } from '@/lib/company/ops-input';

export interface ShiftView {
  weekday: number;
  start: string;
  end: string;
}

export function isOnDuty(shifts: readonly ShiftView[], now: Date): boolean {
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return shifts.some(
    (s) =>
      s.weekday === now.getUTCDay() && toMinutes(s.start) <= minute && minute < toMinutes(s.end),
  );
}
