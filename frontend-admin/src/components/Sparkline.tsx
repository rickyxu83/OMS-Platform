/** 迷你趋势线（sparkline）：纯 SVG 无依赖，currentColor 继承父级文字色，宽度自适应容器。 */
export function Sparkline({ data, className = "" }: { data: number[]; className?: string }) {
  if (!data.length) return null;
  const width = 120;
  const height = 32;
  const padding = 2;
  const max = Math.max(...data, 1);
  const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;
  const points = data.map((value, index) => {
    const x = padding + index * stepX;
    const y = height - padding - (Math.max(0, value) / max) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPoints = [`${padding},${height - padding}`, ...points, `${(width - padding).toFixed(1)},${height - padding}`].join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={areaPoints} fill="currentColor" opacity={0.12} />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
