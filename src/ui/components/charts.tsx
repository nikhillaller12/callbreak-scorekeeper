import { getUnits, getProgression } from '../../domain/match';
import type { Match } from '../../domain/types';
import { fmt } from '../../domain/util';

const COLORS = ['#e8c766', '#6fd3a1', '#ff8a80', '#8ab4ff', '#d6a2ff'];

/** Cumulative score progression, as an accessible inline SVG with a text table fallback for screen readers. */
export function ScoreChart({ match }: { match: Match }) {
  const prog = getProgression(match);
  const units = getUnits(match);
  if (prog.length < 2) return <p className="muted-text">Play at least two rounds to see the score progression.</p>;
  const W = 320, H = 190, L = 34, R = 10, T = 12, B = 26;
  const all = prog.flatMap((p) => Object.values(p.totals));
  let min = Math.min(0, ...all), max = Math.max(1, ...all);
  if (max === min) max = min + 1;
  const x = (i: number) => L + (i * (W - L - R)) / (prog.length - 1);
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const ticks = [min, min + (max - min) / 2, max];
  const step = Math.ceil(prog.length / 7);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Score progression over ${prog.length} rounds`} preserveAspectRatio="xMidYMid meet">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 4} y={y(t) + 3} textAnchor="end" className="axis">{Math.round(t)}</text>
          </g>
        ))}
        {min < 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="zero" />}
        {prog.map((p, i) => (i % step === 0 || i === prog.length - 1) && (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="axis">{p.round}</text>
        ))}
        {units.map((u, ui) => {
          const color = COLORS[ui % COLORS.length];
          const pts = prog.map((p, i) => `${x(i).toFixed(1)},${y(p.totals[u.id] ?? 0).toFixed(1)}`).join(' ');
          const last = prog[prog.length - 1].totals[u.id] ?? 0;
          return (
            <g key={u.id}>
              <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(prog.length - 1)} cy={y(last)} r="3.5" fill={color} />
            </g>
          );
        })}
      </svg>
      <figcaption className="legend">
        {units.map((u, ui) => (
          <span key={u.id}><i style={{ background: COLORS[ui % COLORS.length] }} />{u.name}</span>
        ))}
      </figcaption>
      <table className="sr-only">
        <caption>Cumulative scores after each round</caption>
        <thead><tr><th>Round</th>{units.map((u) => <th key={u.id}>{u.name}</th>)}</tr></thead>
        <tbody>
          {prog.map((p) => (
            <tr key={p.round}><td>{p.round}</td>{units.map((u) => <td key={u.id}>{fmt(p.totals[u.id] ?? 0)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Simple horizontal bars for comparing values (e.g. wins per player). */
export function BarList({ items, format = (n: number) => String(n) }: { items: { label: string; value: number; sub?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="barlist">
      {items.map((it) => (
        <li key={it.label}>
          <div className="barlist-top"><span>{it.label}</span><b>{format(it.value)}</b></div>
          <div className="bar"><span style={{ width: `${Math.max(2, (Math.max(0, it.value) / max) * 100)}%` }} /></div>
          {it.sub && <div className="hint">{it.sub}</div>}
        </li>
      ))}
    </ul>
  );
}
