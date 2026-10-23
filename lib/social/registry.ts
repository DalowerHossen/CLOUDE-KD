// path: lib/social/registry.ts
// The networks that have an adapter. Adding a network is one adapter file and one line here. LinkedIn, X, Telegram and Pinterest
// are not listed: their documentation could not be read (docs/steps/STEP-16/BLOCKERS.md, B3).
import 'server-only';
import type { SocialProvider } from '@/config/s16-social';
import type { SocialAdapter } from './adapter';
import { facebookAdapter } from './adapters/facebook';
import { instagramAdapter } from './adapters/instagram';
import { sandboxAdapter } from './adapters/sandbox';
import { threadsAdapter } from './adapters/threads';

const ADAPTERS: Readonly<Record<SocialProvider, SocialAdapter>> = {
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  threads: threadsAdapter,
  sandbox: sandboxAdapter,
};

export const adapterFor = (provider: SocialProvider): SocialAdapter => ADAPTERS[provider];
