// path: components/shared/motion.tsx
'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { MOTION } from '@/lib/utils/motion';

const ease = MOTION.ease.enter as unknown as [number, number, number, number];

/** Fades and lifts content in. With reduced motion the content simply appears. */
export function Fade({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: MOTION.duration.base, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Scale-and-fade for dialogs and popups. */
export function ScaleIn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: MOTION.duration.fast, ease }}
    >
      {children}
    </motion.div>
  );
}

/** Children appear one after another (list items). */
export function StaggerList({
  children,
  className,
}: {
  children: ReactNode[];
  className?: string;
}): JSX.Element {
  const reduce = useReducedMotion();
  return (
    <motion.ul
      className={className}
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: reduce ? 0 : MOTION.stagger } } }}
    >
      {children.map((child, index) => (
        <motion.li
          key={index}
          variants={{
            hidden: reduce ? { opacity: 1 } : { opacity: 0, y: 8 },
            visible: { opacity: 1, y: 0, transition: { duration: MOTION.duration.base, ease } },
          }}
        >
          {child}
        </motion.li>
      ))}
    </motion.ul>
  );
}

/** Soft transition between pages: wrap the page content in a template. */
export function PageTransition({ children }: { children: ReactNode }): JSX.Element {
  return <Fade>{children}</Fade>;
}
