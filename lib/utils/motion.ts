// path: lib/utils/motion.ts
// Motion constants in the units framer-motion expects. They mirror config/design-tokens.json
// (duration: fast 150ms, base 250ms, slow 400ms; easing: standard, enter, exit).

export const MOTION = {
  duration: { instant: 0.075, fast: 0.15, base: 0.25, slow: 0.4 },
  ease: {
    standard: [0.2, 0, 0, 1],
    enter: [0, 0, 0, 1],
    exit: [0.4, 0, 1, 1],
  },
  stagger: 0.05,
} as const;
