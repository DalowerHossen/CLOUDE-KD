// path: types/contracts/notification.ts
import type { Uuid } from './common';

export interface NotificationInput {
  userId?: Uuid;
  companyId?: Uuid;
  type: string;
  title: string;
  body: string;
  href?: string;
}

export interface NotificationService {
  notify(input: NotificationInput): Promise<void>;
}
