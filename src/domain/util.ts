export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n);
}

/** Round to one decimal place, normalising -0 to 0. */
export function round1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
}

/** Sum score values exactly (via integer tenths) to avoid 0.1 + 0.2 style drift. */
export function sumScores(values: number[]): number {
  const tenths = values.reduce((acc, v) => acc + Math.round(v * 10), 0);
  return round1(tenths / 10);
}

/** Display format: always one decimal, e.g. 4.0, -5.0, 28.4. */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0.0';
  return round1(n).toFixed(1);
}

export function fmtSigned(n: number): string {
  const s = fmt(n);
  return n > 0 ? '+' + s : s;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return Array.from(parts[0]).slice(0, 2).join('').toUpperCase();
  return (Array.from(parts[0])[0] + Array.from(parts[parts.length - 1])[0]).toUpperCase();
}

export function formatDate(ts: number, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(ts).toLocaleDateString(undefined, opts ?? { year: 'numeric', month: 'short', day: 'numeric' });
}

export function weekdayName(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'long' });
}

export function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

export function cleanText(v: unknown, max = 40): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'match';
}
