// path: types/contracts/idempotency.ts

export interface StoredResponse {
  status: number;
  body: string;
  contentType: string;
}

export type IdempotencyBegin =
  | { state: 'new' }
  | { state: 'replay'; response: StoredResponse }
  | { state: 'conflict' }
  | { state: 'in_progress' };

export interface IdempotencyService {
  begin(input: { scope: string; key: string; requestHash: string }): Promise<IdempotencyBegin>;
  complete(scope: string, key: string, response: StoredResponse): Promise<void>;
  /** Frees the key after a failed attempt so the client may retry. */
  release(scope: string, key: string): Promise<void>;
}
