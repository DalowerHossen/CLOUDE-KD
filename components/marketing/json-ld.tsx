// path: components/marketing/json-ld.tsx
import { toScriptText, type JsonLdObject } from '@/lib/seo/jsonld';

/** Structured data for search engines. The text is escaped so it can never close the script tag. */
export function JsonLd({ data }: { data: JsonLdObject | readonly JsonLdObject[] }): JSX.Element {
  return (
    // The text is JSON that toScriptText escaped (no angle brackets or ampersands), so it cannot close the tag.
    // eslint-disable-next-line react/no-danger
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toScriptText(data) }} />
  );
}
