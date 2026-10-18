// path: services/contract/library.ts
// The pre-built contract templates. They are plain wording with merge fields; a company can copy one into its own
// templates and change it. They are general starting points, not legal advice.
export interface LibraryTemplate {
  key: string;
  name: string;
  html: string;
}

const TERMS = '<h2>General terms</h2><p>{{terms}}</p>';

export const CONTRACT_LIBRARY: readonly LibraryTemplate[] = [
  {
    key: 'service-agreement',
    name: 'Service agreement',
    html:
      '<h1>Service agreement {{contract_number}}</h1>' +
      '<p>This agreement is made on {{date}} between {{company_name}} (the provider) and {{client_name}} (the client).</p>' +
      '<h2>Services and fee</h2><p>The provider will deliver the agreed services from {{start_date}} to {{end_date}}. ' +
      'The client will pay a total of USD {{amount}} according to the invoices the provider sends.</p>' +
      TERMS,
  },
  {
    key: 'nda',
    name: 'Mutual non-disclosure agreement',
    html:
      '<h1>Mutual non-disclosure agreement {{contract_number}}</h1>' +
      '<p>This agreement is made on {{date}} between {{company_name}} and {{client_name}}.</p>' +
      '<p>Each party will keep the confidential information of the other private, use it only for the purpose of their ' +
      'business relationship, and return or delete it when asked. This duty lasts until {{end_date}}.</p>' +
      TERMS,
  },
  {
    key: 'retainer',
    name: 'Monthly retainer agreement',
    html:
      '<h1>Retainer agreement {{contract_number}}</h1>' +
      '<p>This agreement is made on {{date}} between {{company_name}} and {{client_name}}.</p>' +
      '<p>The client pays USD {{amount}} for the whole term, which runs from {{start_date}} to {{end_date}}, in return for ' +
      'the reserved hours and services described below.</p>' +
      TERMS,
  },
  {
    key: 'statement-of-work',
    name: 'Statement of work',
    html:
      '<h1>Statement of work {{contract_number}}</h1>' +
      '<p>Dated {{date}}, for {{client_name}}, prepared by {{company_name}}.</p>' +
      '<p>Work starts on {{start_date}} and finishes by {{end_date}}. The agreed price is USD {{amount}}.</p>' +
      TERMS,
  },
];

export function libraryTemplate(key: string): LibraryTemplate | undefined {
  return CONTRACT_LIBRARY.find((t) => t.key === key);
}
