// path: tailwind.config.ts
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import tokens from './config/design-tokens.json';

const colorRole = (name: string): string => `hsl(var(--${name}) / <alpha-value>)`;
const withForeground = (name: string): { DEFAULT: string; foreground: string } => ({
  DEFAULT: colorRole(name),
  foreground: colorRole(`${name}-foreground`),
});

const spacing = Object.fromEntries(
  Object.keys(tokens.spacing).map((k) => [`sp-${k}`, `var(--space-${k})`]),
);
const radius = Object.fromEntries(Object.keys(tokens.radius).map((k) => [k, `var(--radius-${k})`]));
const shadow = Object.fromEntries(Object.keys(tokens.shadow).map((k) => [k, `var(--shadow-${k})`]));
const zIndex = Object.fromEntries(Object.keys(tokens.zIndex).map((k) => [k, `var(--z-${k})`]));
const duration = Object.fromEntries(
  Object.keys(tokens.motion.duration).map((k) => [k, `var(--duration-${k})`]),
);
const easing = Object.fromEntries(
  Object.keys(tokens.motion.easing).map((k) => [k, `var(--ease-${k})`]),
);
const fontSize = Object.fromEntries(
  Object.keys(tokens.typography.scale).map((k) => [
    k,
    [`var(--text-${k})`, { lineHeight: `var(--leading-${k})` }] as [string, { lineHeight: string }],
  ]),
);

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './emails/**/*.{ts,tsx}',
  ],
  theme: {
    screens: tokens.breakpoints,
    extend: {
      colors: {
        border: colorRole('border'),
        input: colorRole('input'),
        ring: colorRole('ring'),
        background: colorRole('background'),
        foreground: colorRole('foreground'),
        primary: withForeground('primary'),
        secondary: withForeground('secondary'),
        destructive: withForeground('destructive'),
        muted: withForeground('muted'),
        accent: withForeground('accent'),
        popover: withForeground('popover'),
        card: withForeground('card'),
        success: withForeground('success'),
        warning: withForeground('warning'),
        info: withForeground('info'),
        chart: {
          '1': colorRole('chart-1'),
          '2': colorRole('chart-2'),
          '3': colorRole('chart-3'),
          '4': colorRole('chart-4'),
          '5': colorRole('chart-5'),
        },
      },
      spacing,
      borderRadius: radius,
      boxShadow: shadow,
      zIndex,
      transitionDuration: duration,
      transitionTimingFunction: easing,
      fontSize,
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in var(--duration-base) var(--ease-enter)',
        'slide-up': 'slide-up var(--duration-base) var(--ease-enter)',
      },
    },
  },
  plugins: [animate],
};

export default config;
