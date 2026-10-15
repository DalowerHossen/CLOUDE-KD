// path: types/contracts/consent.ts

export type ConsentPurpose = 'analytics' | 'marketing' | 'whatsapp' | 'email_marketing' | 'cookies_functional' | 'terms' | 'refund_policy';

export interface ConsentService {
  record(input: { subject: string; purpose: ConsentPurpose; version: string; text: string }): Promise<void>;
  has(subject: string, purpose: ConsentPurpose): Promise<boolean>;
  withdraw(subject: string, purpose: ConsentPurpose): Promise<void>;
}
