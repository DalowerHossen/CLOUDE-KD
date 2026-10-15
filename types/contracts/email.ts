// path: types/contracts/email.ts
import type { Uuid } from './common';

export interface EmailSendInput {
  template: string;
  to: string;
  data: Record<string, unknown>;
  companyId?: Uuid | null;
  /** Required so a retry never sends twice. */
  idempotencyKey: string;
}

export interface EmailTemplateDefinition {
  id: string;
  subject: string;
  /** Variable names the template needs. */
  variables: readonly string[];
}

export interface EmailService {
  send(input: EmailSendInput): Promise<void>;
  enqueue(input: EmailSendInput & { sendAt?: Date }): Promise<void>;
  registerTemplate(definition: EmailTemplateDefinition): void;
}
