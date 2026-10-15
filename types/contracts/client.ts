// path: types/contracts/client.ts
import type { Uuid } from './common';

export interface ClientBilling {
  clientId: Uuid;
  name: string;
  email: string | null;
  billingPostalCode: string | null;
  /** ISO 3166-1 alpha-2. */
  billingCountry: string | null;
}

export interface ClientService {
  getById(
    clientId: Uuid,
  ): Promise<{ id: Uuid; companyId: Uuid; name: string; email: string | null }>;
  getBilling(clientId: Uuid): Promise<ClientBilling>;
}
