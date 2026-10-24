# STEP 06 - Illustration and chart style guide

This guide covers the artwork and charts of the public site and the marketing admin pages.

## Illustrations (`components/marketing/art/illustrations.tsx`)

- Six scenes: empty, search, document, secure, success, error. One scene = one message; the meaning is always in the text beside the picture, never inside it.
- Flat shapes on a 160 by 144 canvas, two tones only: the primary color (`--primary`) and its 15 percent tint, plus the muted text color for lines. The error scene uses `--destructive`. No gradients, no shadows, no text.
- Colors come from theme tokens, so artwork follows light, dark and high contrast without extra files.
- Artwork is decorative: `aria-hidden`, `role="presentation"`, not focusable, no `alt` needed. Use `<Illustration kind="..." className="h-20 w-auto" />` for a smaller size.
- Hero areas use `HeroBackdrop`: two soft circles, static, no animation.
- Rules for new scenes: stroke width 4 to 6, round caps and joins, keep a 12 unit margin, reuse the same two tones, test in dark and high contrast.

## Charts (`components/marketing/charts/bar-chart.tsx`)

- Plain SVG, no chart library, one color (`--primary`), values scaled to the largest bar. Values are counts; money never goes through this chart.
- Every chart has a title (also the accessible name), a tooltip per bar (`<title>`), and a hidden table with the same numbers for screen readers.
- No animation, so reduced motion needs no special case. Print shows the chart as it is.
- Do not use color alone to carry meaning; label the axis in the surrounding text.

## Print

- Public pages print without the header, footer, cookie banner, skip link and surprise message (class `no-print`). Links show their address after the text (rule in `styles/globals.css`). Tools hide their forms and print the document only.

## Surprise

- The classic key sequence (up, up, down, down, left, right, left, right, b, a) shows a short celebration and one line of text. It is ignored while typing in a field and shows nothing with reduced motion.
