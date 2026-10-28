const [CX, CY, R] = [150, 140, 88];

export interface RadarSeries {
  color: string;
  on: boolean;
  values: readonly number[];
}

/** A radar of every option's scores, one axis per dimension; the selected option is drawn bold. */
export function Radar({ dims, series, max = 5 }: { dims: readonly string[]; series: readonly RadarSeries[]; max?: number }) {
  const n = dims.length;
  if (n < 3) {
    return <svg width="290" height="260" viewBox="0 0 300 270" />;
  }
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [CX + (Math.cos(a) * R * v) / max, CY + (Math.sin(a) * R * v) / max];
  };
  const ring = (v: number) => dims.map((_, i) => pt(i, v).join(",")).join(" ");
  return (
    <svg width="290" height="260" viewBox="0 0 300 270">
      {Array.from({ length: max }, (_, k) => (
        <polygon key={k} points={ring(k + 1)} fill="none" stroke="#2d2c29" />
      ))}
      {dims.map((d, i) => {
        const [x, y] = pt(i, max);
        const [lx, ly] = pt(i, max + 1.05);
        return (
          <g key={d}>
            <line x1={CX} y1={CY} x2={x} y2={y} stroke="#2d2c29" />
            <text x={lx} y={ly} fill="#a6a69c" fontSize="10.5" textAnchor="middle" dominantBaseline="middle">
              {d}
            </text>
          </g>
        );
      })}
      {series.map((s, si) => (
        <polygon
          key={si}
          points={s.values.map((v, i) => pt(i, v).join(",")).join(" ")}
          fill={s.color}
          fillOpacity={s.on ? 0.22 : 0.04}
          stroke={s.color}
          strokeWidth={s.on ? 2.2 : 1}
          strokeOpacity={s.on ? 1 : 0.5}
        />
      ))}
    </svg>
  );
}
