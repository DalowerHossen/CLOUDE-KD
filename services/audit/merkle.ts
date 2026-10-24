// path: services/audit/merkle.ts
// Merkle root over entry hashes. An odd node is paired with itself. Leaves and nodes use distinct prefixes.
import { sha256Hex } from '@/lib/utils/hash';

export async function merkleRoot(leafHashes: readonly string[]): Promise<string> {
  if (leafHashes.length === 0) throw new RangeError('At least one leaf is required.');
  let level = await Promise.all(leafHashes.map((h) => sha256Hex(`leaf:${h}`)));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] as string;
      const right = level[i + 1] ?? left;
      next.push(await sha256Hex(`node:${left}:${right}`));
    }
    level = next;
  }
  return level[0] as string;
}
