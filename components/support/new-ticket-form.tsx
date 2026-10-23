// path: components/support/new-ticket-form.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { CATEGORIES } from '@/lib/helpdesk/rules';
import { t, type StringKey } from '@/lib/i18n';

const result = z.object({ data: z.object({ id: z.string().uuid() }) });
const errorBody = z.object({ error: z.object({ message: z.string() }) });

export function NewTicketForm(): JSX.Element {
  const router = useRouter();
  const [form, setForm] = useState({
    subject: '',
    category: 'question',
    priority: 'normal',
    body: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json: unknown = await response.json().catch(() => null);
      if (response.ok) {
        const ok = result.safeParse(json);
        router.replace(ok.success ? `/support/${ok.data.data.id}` : '/support');
        router.refresh();
        return;
      }
      const err = errorBody.safeParse(json);
      setError(err.success ? err.data.error.message : t('s07Company.support.error'));
    } catch {
      setError(t('s07Company.support.error'));
    }
    setBusy(false);
  }

  return (
    <form
      className="space-y-sp-12"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="block text-sm">
        <span className="block font-medium">{t('s07Company.support.subject')}</span>
        <Input
          required
          minLength={3}
          maxLength={200}
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
        />
      </label>
      <div className="grid gap-sp-12 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="block font-medium">{t('s07Company.support.category')}</span>
          <NativeSelect
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`s07Company.support.categories.${c}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="block text-sm">
          <span className="block font-medium">{t('s07Company.support.priority')}</span>
          <NativeSelect
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
          >
            {(['low', 'normal', 'high'] as const).map((c) => (
              <option key={c} value={c}>
                {t(`s07Company.support.priorities.${c}` as StringKey)}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      <label className="block text-sm">
        <span className="block font-medium">{t('s07Company.support.body')}</span>
        <Textarea
          required
          rows={6}
          maxLength={5000}
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy}>
        {t('s07Company.support.send')}
      </Button>
    </form>
  );
}
