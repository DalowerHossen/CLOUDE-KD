// path: emails/marketing/campaign.tsx
import { MessageEmail } from './message';

export interface CampaignProps {
  subject: string;
  bodyText: string;
  name: string;
}

export function CampaignEmail({ subject, bodyText, name }: CampaignProps): JSX.Element {
  const paragraphs = bodyText
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <MessageEmail
      preview={subject}
      greeting={name ? `Hello ${name},` : 'Hello,'}
      paragraphs={paragraphs}
    />
  );
}
