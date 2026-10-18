// path: services/portal/device.ts
// A short, human-readable device label from the browser string ("Chrome on Windows"). Pure and approximate: it is a hint
// for the owner and for evidence packs, not an identity.
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/edg(e|a|ios)?\//i, 'Edge'],
  [/opr\/|opera/i, 'Opera'],
  [/firefox|fxios/i, 'Firefox'],
  [/chrome|crios/i, 'Chrome'],
  [/safari/i, 'Safari'],
];
const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/windows/i, 'Windows'],
  [/android/i, 'Android'],
  [/iphone|ipad|ipod|ios/i, 'iOS'],
  [/mac os x|macintosh/i, 'macOS'],
  [/cros/i, 'ChromeOS'],
  [/linux|x11/i, 'Linux'],
];

export function describeDevice(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  if (!browser && !system) return 'Unknown device';
  return `${browser ?? 'Browser'} on ${system ?? 'unknown system'}`;
}
