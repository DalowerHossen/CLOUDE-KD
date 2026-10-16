// path: lib/seo/jsonld.ts
// Builders for the eight structured-data types of the public site: Organization, WebSite, BreadcrumbList, Article,
// FAQPage, SoftwareApplication, JobPosting and ItemList. Each returns a plain object for a JSON-LD script.
import { SITE_NAME, SITE_TAGLINE } from '@/config/seo';
import type { SeoSettings } from './settings';

export type JsonLdObject = Record<string, unknown>;
const CONTEXT = 'https://schema.org';

export function organization(origin: string, settings: SeoSettings): JsonLdObject {
  const sameAs = Object.values(settings.social).filter((v) => v !== '');
  return {
    '@context': CONTEXT,
    '@type': 'Organization',
    name: SITE_NAME,
    ...(settings.organization.legalName ? { legalName: settings.organization.legalName } : {}),
    url: origin,
    logo: `${origin}/icon-512.png`,
    description: SITE_TAGLINE,
    ...(sameAs.length ? { sameAs } : {}),
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        url: `${origin}/contact`,
        ...(settings.organization.contactEmail
          ? { email: settings.organization.contactEmail }
          : {}),
        availableLanguage: 'English',
      },
    ],
  };
}

export function webSite(origin: string): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    name: SITE_NAME,
    url: origin,
    inLanguage: 'en',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${origin}/blog?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbs(
  origin: string,
  trail: readonly { name: string; path: string }[],
): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${origin}${item.path}`,
    })),
  };
}

export function article(
  origin: string,
  post: {
    slug: string;
    title: string;
    description: string;
    publishedAt: string;
    updatedAt: string;
    authorName: string;
    coverUrl: string | null;
  },
): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'Article',
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${origin}/blog/${post.slug}` },
    headline: post.title.slice(0, 110),
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: { '@type': 'Person', name: post.authorName },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${origin}/icon-512.png` },
    },
    ...(post.coverUrl ? { image: [post.coverUrl] } : {}),
  };
}

export function faqPage(items: readonly { question: string; answer: string }[]): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: items.map((q) => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    })),
  };
}

/** The product itself. No offer is listed: prices belong to billing and appear only where the site shows them. */
export function softwareApplication(origin: string): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: origin,
    description: SITE_TAGLINE,
    inLanguage: 'en',
  };
}

export function jobPosting(
  origin: string,
  job: { title: string; text: string; location: string; type: string },
  postedAt: string,
): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'JobPosting',
    title: job.title,
    description: job.text,
    datePosted: postedAt,
    employmentType: job.type.toLowerCase().includes('part')
      ? 'PART_TIME'
      : job.type.toLowerCase().includes('contract')
        ? 'CONTRACTOR'
        : 'FULL_TIME',
    hiringOrganization: { '@type': 'Organization', name: SITE_NAME, sameAs: origin },
    jobLocation: {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: job.location },
    },
  };
}

export function itemList(
  origin: string,
  items: readonly { name: string; path: string }[],
): JsonLdObject {
  return {
    '@context': CONTEXT,
    '@type': 'ItemList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${origin}${item.path}`,
      name: item.name,
    })),
  };
}

/** Text for a script tag: the characters that could end the tag or start a comment are escaped. */
export function toScriptText(data: JsonLdObject | readonly JsonLdObject[]): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
    .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029');
}
