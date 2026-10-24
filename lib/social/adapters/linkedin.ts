// path: lib/social/adapters/linkedin.ts
// LinkedIn text posts (host api.linkedin.com, Posts API). Documentation read 2026-10-23: docs/integrations/social-more.md
// ("LinkedIn"). The account id is the author URN (urn:li:organization:<id> or urn:li:person:<id>); the token needs
// w_organization_social or w_member_social. Images need the Images API upload, which is not built.
import 'server-only';
import { LINKEDIN_API_URL, LINKEDIN_API_VERSION } from '@/config/s16-social';
import type { SocialAdapter } from '../adapter';
import { SocialApiError } from '../graph';
import { request } from '../http';
import { linkedinCommentary, textWithLink } from '../rules';

export const linkedinAdapter: SocialAdapter = {
  id: 'linkedin',
  label: 'LinkedIn',
  async publish(account, post, fetcher) {
    const result = await request(
      {
        url: `${LINKEDIN_API_URL}/posts`,
        method: 'POST',
        headers: {
          authorization: `Bearer ${account.token}`,
          'x-restli-protocol-version': '2.0.0',
          'linkedin-version': LINKEDIN_API_VERSION,
        },
        json: {
          author: account.externalId,
          commentary: linkedinCommentary(textWithLink(post)),
          visibility: 'PUBLIC',
          distribution: {
            feedDistribution: 'MAIN_FEED',
            targetEntities: [],
            thirdPartyDistributionChannels: [],
          },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        },
      },
      fetcher,
    );
    // The answer is 201 with the post id (urn:li:share:... or urn:li:ugcPost:...) in the x-restli-id header.
    const id = result.headers.get('x-restli-id') ?? '';
    if (id === '') throw new SocialApiError('The network did not return an id.', null, 201, false);
    return { state: 'published', externalId: id.slice(0, 200), url: null };
  },
};
