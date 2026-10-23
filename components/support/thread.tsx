// path: components/support/thread.tsx
// The messages of a ticket, oldest first. Internal notes are marked; the company never receives them.
import { t } from '@/lib/i18n';
import type { MessageRow } from '@/services/support/tickets';

export function Thread({ messages }: { messages: MessageRow[] }): JSX.Element {
  return (
    <ol className="space-y-sp-8">
      {messages.map((m) => (
        <li
          key={m.id}
          className={
            m.internal
              ? 'rounded-lg border border-dashed bg-muted p-sp-12 text-sm'
              : m.authorKind === 'customer'
                ? 'rounded-lg border bg-card p-sp-12 text-sm'
                : 'rounded-lg border bg-accent p-sp-12 text-sm'
          }
        >
          <div className="flex flex-wrap justify-between gap-sp-8 text-muted-foreground">
            <span>
              {m.authorName}
              {m.internal ? ` - ${t('s07Company.support.internalNote')}` : ''}
            </span>
            <time>{m.at.replace('T', ' ').slice(0, 16)} UTC</time>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words">{m.body}</p>
        </li>
      ))}
    </ol>
  );
}
