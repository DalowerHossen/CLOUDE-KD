// path: lib/utils/hash.ts
// Hashing and encoding helpers built on Web Crypto, so they work in Node and Edge runtimes.

const encoder = new TextEncoder();

function toBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === 'string' ? encoder.encode(input) : input;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) throw new RangeError('Invalid hex text.');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(text: string): Uint8Array {
  const padded = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function sha256Bytes(input: string | Uint8Array): Promise<Uint8Array> {
  const data = toBytes(input);
  const buffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  return bytesToHex(await sha256Bytes(input));
}

export async function hmacSha256Bytes(
  key: string | Uint8Array,
  data: string | Uint8Array,
): Promise<Uint8Array> {
  const keyBytes = toBytes(key);
  const keyBuffer = keyBytes.buffer.slice(
    keyBytes.byteOffset,
    keyBytes.byteOffset + keyBytes.byteLength,
  ) as ArrayBuffer;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const dataBytes = toBytes(data);
  const dataBuffer = dataBytes.buffer.slice(
    dataBytes.byteOffset,
    dataBytes.byteOffset + dataBytes.byteLength,
  ) as ArrayBuffer;
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer));
}

export async function hmacSha256Hex(
  key: string | Uint8Array,
  data: string | Uint8Array,
): Promise<string> {
  return bytesToHex(await hmacSha256Bytes(key, data));
}

/** Compares two strings in time that depends only on the longer length. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function randomHex(byteLength: number): string {
  return bytesToHex(randomBytes(byteLength));
}

export function randomBase64Url(byteLength: number): string {
  return base64UrlEncode(randomBytes(byteLength));
}
