// path: services/base/duplicate-detector.ts
// Base class for duplicate detection. A subclass defines the fingerprint (normalized key) and the lookup.
import { DuplicateError } from '@/lib/errors';
import { sha256Hex } from '@/lib/utils/hash';

export interface DuplicateMatch {
  id: string;
  reason: string;
}

export abstract class DuplicateDetector<TInput> {
  /** Stable text that identifies "the same thing" (normalize case, spacing, formatting here). */
  protected abstract fingerprintSource(input: TInput): string;
  /** Returns existing records that match the fingerprint inside the caller's tenant. */
  protected abstract findExisting(fingerprint: string, input: TInput): Promise<DuplicateMatch[]>;

  async fingerprint(input: TInput): Promise<string> {
    return sha256Hex(this.fingerprintSource(input));
  }

  async check(input: TInput): Promise<DuplicateMatch[]> {
    return this.findExisting(await this.fingerprint(input), input);
  }

  /** Throws DuplicateError (409) with the matching ids when a duplicate exists. */
  async assertNoDuplicate(input: TInput): Promise<void> {
    const matches = await this.check(input);
    if (matches.length > 0) {
      throw new DuplicateError('A similar item already exists.', { matches });
    }
  }
}
