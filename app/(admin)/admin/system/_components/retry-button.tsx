// path: app/(admin)/admin/system/_components/retry-button.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { sendJson } from '../../_components/post-json';

export function RetryButton({ id, label }: { id: string; label: string }): JSX.Element {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          const failed = await sendJson('/api/admin/system/jobs', 'POST', { id });
          setError(failed);
          if (!failed) router.refresh();
        }}
      >
        {label}
      </Button>
      {error ? (
        <span role="alert" className="ml-sp-8 text-sm text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}
