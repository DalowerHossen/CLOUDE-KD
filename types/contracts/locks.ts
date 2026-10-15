// path: types/contracts/locks.ts

export interface LockService {
  /** Holds a PostgreSQL advisory transaction lock for the key while fn runs. */
  withAdvisoryLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
  /** SELECT ... FOR UPDATE on one row while fn runs. */
  withRowLock<T>(table: string, id: string, fn: () => Promise<T>): Promise<T>;
  /** UPDATE ... WHERE id = ? AND version = ?. Throws ConflictError when no row is updated. */
  updateWithVersion<T extends Record<string, unknown>>(
    table: string,
    id: string,
    expectedVersion: number,
    patch: T,
  ): Promise<{ version: number }>;
}
