// path: components/shared/confetti.tsx
'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
] as const;

/** Short celebration (for example after a successful payment). Renders nothing with reduced motion. */
export function Confetti({ pieces = 36 }: { pieces?: number }): JSX.Element | null {
  const reduce = useReducedMotion();
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, index) => ({
        id: index,
        x: (Math.sin(index * 12.9898) * 43758.5453) % 1,
        drift: ((index * 37) % 200) - 100,
        delay: (index % 9) * 0.04,
        color: COLORS[index % COLORS.length] ?? COLORS[0],
        rotate: (index * 53) % 360,
      })),
    [pieces],
  );
  if (reduce) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-toast overflow-hidden">
      {items.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 block h-2.5 w-1.5 rounded-sm"
          style={{ left: `${Math.abs(p.x) * 100}%`, backgroundColor: p.color }}
          initial={{ y: -20, opacity: 1, rotate: 0 }}
          animate={{ y: '100vh', x: p.drift, opacity: 0, rotate: p.rotate + 360 }}
          transition={{ duration: 2.2, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}
