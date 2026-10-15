// path: lib/utils/uuid.ts
// UUID version 7 (time-ordered). Monotonic within one process, works in Node and Edge runtimes.

let lastMs = 0;
let lastSeq = 0;

const HEX: string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/** Generates a UUID v7. `nowMs` exists for deterministic verification only. */
export function uuidv7(nowMs: number = Date.now()): string {
  let ms = nowMs;
  const rand = new Uint8Array(10);
  crypto.getRandomValues(rand);

  if (ms <= lastMs) {
    ms = lastMs;
    lastSeq += 1;
    if (lastSeq > 0xfff) {
      ms += 1;
      lastSeq = 0;
    }
  } else {
    lastSeq = ((rand[0] ?? 0) << 4) | ((rand[1] ?? 0) >> 4);
    lastSeq &= 0x7ff; // leave headroom so the counter does not overflow immediately
  }
  lastMs = ms;

  const bytes = new Uint8Array(16);
  // 48-bit big-endian millisecond timestamp, built without 32-bit bitwise limits.
  let t = ms;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = t % 256;
    t = Math.floor(t / 256);
  }
  bytes[6] = 0x70 | ((lastSeq >> 8) & 0x0f);
  bytes[7] = lastSeq & 0xff;
  bytes[8] = 0x80 | ((rand[2] ?? 0) & 0x3f);
  for (let i = 9; i < 16; i++) bytes[i] = rand[i - 6] ?? 0;

  const h = (i: number): string => HEX[bytes[i] ?? 0] ?? '00';
  return `${h(0)}${h(1)}${h(2)}${h(3)}-${h(4)}${h(5)}-${h(6)}${h(7)}-${h(8)}${h(9)}-${h(10)}${h(11)}${h(12)}${h(13)}${h(14)}${h(15)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Extracts the millisecond timestamp from a UUID v7. */
export function uuidv7Timestamp(id: string): number {
  if (!isUuid(id) || id[14] !== '7') throw new RangeError('Not a UUID v7.');
  return Number.parseInt(id.replace(/-/g, '').slice(0, 12), 16);
}
