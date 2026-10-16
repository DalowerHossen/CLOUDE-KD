// path: components/marketing/easter-egg.tsx
'use client';
import { useEffect, useState } from 'react';
import { Confetti } from '@/components/shared/confetti';
import { t } from '@/lib/i18n';

const CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

/** A small surprise: the classic key sequence shows a short celebration. Silent for everyone else. */
export function EasterEgg(): JSX.Element | null {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let index = 0;
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      index = event.key === CODE[index] ? index + 1 : event.key === CODE[0] ? 1 : 0;
      if (index === CODE.length) {
        index = 0;
        setShown((n) => n + 1);
        window.setTimeout(() => setShown(0), 3500);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  if (shown === 0) return null;
  return (
    <>
      <Confetti key={shown} />
      <p
        role="status"
        className="fixed bottom-4 left-1/2 z-toast -translate-x-1/2 rounded-full border bg-card px-4 py-2 text-sm shadow-lg no-print"
      >
        {t('s06Public.polish.egg')}
      </p>
    </>
  );
}
