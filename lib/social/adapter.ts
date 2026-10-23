// path: lib/social/adapter.ts
// What every network adapter offers. Publishing is one step or two: Facebook and the sandbox publish at once; Instagram makes a
// container and publishes it; Threads makes a container and asks to publish it about 30 seconds later (`pending`), which the
// cron job then finishes with `finish`.
import type { SocialProvider } from '@/config/s16-social';
import type { PostContent } from './rules';
import type { Fetcher } from './graph';

export interface AdapterAccount {
  provider: SocialProvider;
  externalId: string;
  token: string;
}

export interface PublishedPost {
  state: 'published';
  externalId: string;
  url: string | null;
}

export interface PendingPost {
  state: 'pending';
  containerId: string;
  publishAfterSeconds: number;
}

export interface SocialAdapter {
  id: SocialProvider;
  label: string;
  /** Sends the post. */
  publish(
    account: AdapterAccount,
    post: PostContent,
    fetcher?: Fetcher,
  ): Promise<PublishedPost | PendingPost>;
  /** Finishes a pending post (publishes its container). Adapters that publish at once do not have it. */
  finish?(account: AdapterAccount, containerId: string, fetcher?: Fetcher): Promise<PublishedPost>;
  /** A cheap read that proves the token and the id belong together; returns the name the network shows. */
  check?(account: AdapterAccount, fetcher?: Fetcher): Promise<{ name: string }>;
}
