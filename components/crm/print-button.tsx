// path: components/crm/print-button.tsx
'use client';
import { Button } from '@/components/ui/button';

export function PrintButton({ label }: { label: string }): JSX.Element {
  return (
    <Button type="button" variant="outline" className="print:hidden" onClick={() => window.print()}>
      {label}
    </Button>
  );
}
