// path: components/marketing/charts/bar-chart.tsx
// Marketing bar chart (style guide: docs/steps/STEP-06/ART_GUIDE.md). Plain SVG, one color from the theme, labels in
// text, a hidden table with the same numbers for screen readers, and no animation (so reduced motion needs no case).

export interface BarPoint {
  label: string;
  value: number;
}

/** Bars scale to the largest value. Values are counts, never money. */
export function BarChart({
  data,
  title,
}: {
  data: readonly BarPoint[];
  title: string;
}): JSX.Element {
  const width = 600;
  const height = 160;
  const gap = 4;
  const max = Math.max(1, ...data.map((d) => d.value));
  const barWidth =
    data.length > 0 ? Math.max(2, (width - gap * (data.length - 1)) / data.length) : 0;
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
        className="h-40 w-full"
        preserveAspectRatio="none"
      >
        {data.map((d, i) => {
          const h = Math.round((d.value / max) * (height - 4));
          return (
            <rect
              key={`${d.label}-${i}`}
              x={i * (barWidth + gap)}
              y={height - h}
              width={barWidth}
              height={h}
              rx={2}
              fill="hsl(var(--primary))"
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {data.map((d, i) => (
            <tr key={`${d.label}-${i}`}>
              <th scope="row">{d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
