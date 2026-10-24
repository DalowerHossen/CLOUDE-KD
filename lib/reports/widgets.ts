// path: lib/reports/widgets.ts
// The widgets of the dashboard and how a saved layout is read back. A layout lists widgets in order with a visible flag;
// widgets that were added after the layout was saved appear at the end, widgets that no longer exist are dropped.
import { z } from 'zod';

export const WIDGET_IDS = [
  'search',
  'quick',
  'cards',
  'chart',
  'aging',
  'attention',
  'recent',
  'time',
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export interface WidgetState {
  id: WidgetId;
  visible: boolean;
}

export const layoutSchema = z
  .object({
    widgets: z
      .array(z.object({ id: z.enum(WIDGET_IDS), visible: z.boolean() }).strict())
      .max(WIDGET_IDS.length),
  })
  .strict()
  .refine((v) => new Set(v.widgets.map((w) => w.id)).size === v.widgets.length, {
    message: 'A widget can be listed once.',
    path: ['widgets'],
  });

export function defaultLayout(): WidgetState[] {
  return WIDGET_IDS.map((id) => ({ id, visible: true }));
}

/** Saved layout merged with the widgets that exist and the ones this person may use. */
export function normalizeLayout(saved: unknown, allowed: ReadonlySet<WidgetId>): WidgetState[] {
  const parsed = layoutSchema.safeParse({ widgets: saved });
  const base = parsed.success ? parsed.data.widgets : [];
  const seen = new Set<WidgetId>();
  const out: WidgetState[] = [];
  for (const w of base) {
    if (!allowed.has(w.id) || seen.has(w.id)) continue;
    seen.add(w.id);
    out.push(w);
  }
  for (const id of WIDGET_IDS)
    if (allowed.has(id) && !seen.has(id)) out.push({ id, visible: true });
  return out;
}

/** Moves a widget one place up or down. */
export function moveWidget(
  list: readonly WidgetState[],
  id: WidgetId,
  direction: -1 | 1,
): WidgetState[] {
  const i = list.findIndex((w) => w.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const next = [...list];
  const a = next[i] as WidgetState;
  next[i] = next[j] as WidgetState;
  next[j] = a;
  return next;
}
