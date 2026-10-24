// path: lib/email/presets.ts
// One-click SMTP presets (feature 452). Host and port are the providers' public SMTP endpoints; the owner enters the
// credentials. "ses" needs the region; the username is the SMTP user the provider created.
export interface SmtpPreset {
  id: string;
  label: string;
  host: (region?: string) => string;
  port: number;
  security: 'ssl' | 'starttls';
  note?: string;
}

export const SMTP_PRESETS: readonly SmtpPreset[] = [
  {
    id: 'ses',
    label: 'Amazon SES',
    host: (r) => `email-smtp.${r ?? 'us-east-1'}.amazonaws.com`,
    port: 587,
    security: 'starttls',
    note: 'Use the SMTP credentials created in SES, not your AWS keys.',
  },
  {
    id: 'sendgrid',
    label: 'SendGrid (SMTP)',
    host: () => 'smtp.sendgrid.net',
    port: 587,
    security: 'starttls',
    note: 'Username is "apikey"; the password is the API key.',
  },
  {
    id: 'mailgun',
    label: 'Mailgun (SMTP)',
    host: () => 'smtp.mailgun.org',
    port: 587,
    security: 'starttls',
  },
  {
    id: 'postmark',
    label: 'Postmark (SMTP)',
    host: () => 'smtp.postmarkapp.com',
    port: 587,
    security: 'starttls',
    note: 'Username and password are the server token.',
  },
  {
    id: 'resend',
    label: 'Resend (SMTP)',
    host: () => 'smtp.resend.com',
    port: 465,
    security: 'ssl',
    note: 'Username is "resend"; the password is the API key.',
  },
  {
    id: 'brevo',
    label: 'Brevo',
    host: () => 'smtp-relay.brevo.com',
    port: 587,
    security: 'starttls',
  },
  {
    id: 'sparkpost',
    label: 'SparkPost',
    host: () => 'smtp.sparkpostmail.com',
    port: 587,
    security: 'starttls',
    note: 'Username is "SMTP_Injection".',
  },
  {
    id: 'mandrill',
    label: 'Mandrill',
    host: () => 'smtp.mandrillapp.com',
    port: 587,
    security: 'starttls',
  },
  {
    id: 'elasticemail',
    label: 'Elastic Email',
    host: () => 'smtp.elasticemail.com',
    port: 2525,
    security: 'starttls',
  },
  {
    id: 'smtp2go',
    label: 'SMTP2GO',
    host: () => 'mail.smtp2go.com',
    port: 2525,
    security: 'starttls',
  },
  { id: 'zoho', label: 'Zoho Mail', host: () => 'smtp.zoho.com', port: 465, security: 'ssl' },
  {
    id: 'google',
    label: 'Google Workspace',
    host: () => 'smtp.gmail.com',
    port: 587,
    security: 'starttls',
    note: 'Use an app password.',
  },
  {
    id: 'microsoft365',
    label: 'Microsoft 365',
    host: () => 'smtp.office365.com',
    port: 587,
    security: 'starttls',
  },
];

export function presetById(id: string): SmtpPreset | undefined {
  return SMTP_PRESETS.find((p) => p.id === id);
}
