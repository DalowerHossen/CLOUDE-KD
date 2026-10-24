// path: lib/storage/scanner.ts
// Malware scanner hook. The default adapter talks to a small HTTPS gateway in front of ClamAV; any other scanner
// can be plugged in by implementing the same interface.
export type ScanVerdict =
  | { status: 'clean' }
  | { status: 'infected'; signature: string }
  | { status: 'error'; message: string };

export interface MalwareScanner {
  scan(bytes: Uint8Array): Promise<ScanVerdict>;
}

/**
 * Gateway contract: POST the file bytes as application/octet-stream with a bearer token.
 * Answer 200 with JSON { "infected": boolean, "signature": string | null }.
 */
export function createHttpScanner(
  url: string,
  token: string | undefined,
  timeoutMs = 15_000,
): MalwareScanner {
  return {
    async scan(bytes) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/octet-stream',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: Buffer.from(bytes),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok)
          return { status: 'error', message: `scanner answered ${response.status}` };
        const body: unknown = await response.json();
        if (
          typeof body !== 'object' ||
          body === null ||
          typeof (body as { infected?: unknown }).infected !== 'boolean'
        ) {
          return { status: 'error', message: 'scanner answer not understood' };
        }
        const parsed = body as { infected: boolean; signature?: unknown };
        return parsed.infected
          ? {
              status: 'infected',
              signature:
                typeof parsed.signature === 'string' ? parsed.signature.slice(0, 120) : 'unknown',
            }
          : { status: 'clean' };
      } catch (error) {
        return {
          status: 'error',
          message: error instanceof Error ? error.message.slice(0, 120) : 'scanner failed',
        };
      }
    },
  };
}
