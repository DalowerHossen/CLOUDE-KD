// path: services/audit/mask-ip.ts
// Masks an address for storage: IPv4 keeps /24, IPv6 keeps the first three groups (/48).
export function maskIp(ip: string): string {
  if (ip.includes(':')) {
    const groups = ip.split(':').filter((g) => g.length > 0).slice(0, 3);
    return `${groups.join(':')}::/48`;
  }
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}
