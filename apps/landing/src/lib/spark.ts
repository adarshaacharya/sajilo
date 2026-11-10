/**
 * A series as an SVG path in a `w × h` box, scaled to its own low and high.
 * `pad` keeps the stroke off the box's top and bottom edges.
 */
export function sparkPath(values: number[], w = 100, h = 24, pad = 2): string {
  if (values.length < 2) return "";
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = pad + (1 - (v - lo) / span) * (h - 2 * pad);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
