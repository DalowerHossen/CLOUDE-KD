// path: lib/email/hold.ts
// What to do with a message when every provider of the chain refused its own settings (wrong sign-in, missing server) and none had
// a temporary problem: that is not the message's fault, so it is held without using up an attempt and sent as soon as the
// settings are fixed. A held message is given up after this long (a link in it would be old anyway).
export const CONFIG_HOLD_HOURS = 72;

export type HoldDecision = 'none' | 'hold' | 'give_up';

export function configHold(
  sawConfig: boolean,
  sawTemporary: boolean,
  createdAt: string | null,
  now: Date,
): HoldDecision {
  if (!sawConfig || sawTemporary) return 'none';
  const born = createdAt ? Date.parse(createdAt) : Number.NaN;
  if (!Number.isNaN(born) && now.getTime() - born > CONFIG_HOLD_HOURS * 3_600_000) return 'give_up';
  return 'hold';
}
