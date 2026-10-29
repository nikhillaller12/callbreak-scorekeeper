/** Text, CSV and JSON exports. Pure string builders so they are easy to test. */
import { computeTotals, getStandings, getUnits, isTeamMatch, scoreAllRounds, unitMembersLabel, winnerLabel } from '../domain/match';
import { buildBackup } from '../domain/sanitize';
import type { AppData, Match } from '../domain/types';
import { fmt, formatDate, slug } from '../domain/util';

const BAR = '━━━━━━━━━━━━━━━━━━━━';

export function shareText(match: Match): string {
  const standings = getStandings(match);
  const teamed = isTeamMatch(match);
  const lines: string[] = [BAR, '🃏 CALL BREAK', BAR, ''];
  lines.push(match.name, formatDate(match.completedAt ?? match.updatedAt), '');
  if (match.rounds.length > 0) {
    const winners = standings.filter((s) => s.rank === 1);
    lines.push(winners.length > 1 ? '🤝 TIE' : '🏆 WINNER', winners.map((w) => w.unit.name).join(' & '), '');
  }
  standings.forEach((s, i) => {
    const medal = ['🥇', '🥈', '🥉', '4️⃣'][s.rank - 1] ?? `${i + 1}.`;
    lines.push(`${teamed ? '👥' : medal} ${s.unit.name}`);
    if (teamed) lines.push(unitMembersLabel(match, s.unit));
    lines.push(`${fmt(s.total)} points`, '');
  });
  lines.push(`Rounds: ${match.rounds.length}`, BAR);
  return lines.join('\n');
}

function csvCell(v: string | number): string {
  const s = String(v);
  // Neutralise spreadsheet formula injection from names.
  const safe = /^[=+\-@\t\r]/.test(s) && typeof v === 'string' ? "'" + s : s;
  return /[",\n\r]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}

export function matchCsv(match: Match): string {
  const units = getUnits(match);
  const teamed = isTeamMatch(match);
  const scores = scoreAllRounds(match);
  const totals = computeTotals(match);
  const header = ['Round', ...match.players.flatMap((p) => [`${p.name} call`, `${p.name} tricks`, `${p.name} score`]), ...(teamed ? units.map((u) => `${u.name} total`) : [])];
  const rows: (string | number)[][] = [header];
  match.rounds.forEach((r, i) => {
    const row: (string | number)[] = [r.roundNumber];
    for (const p of match.players) {
      const e = r.entries.find((x) => x.playerId === p.id);
      row.push(e?.call ?? '', e?.tricks ?? '', fmt(scores[i].player[p.id] ?? 0));
    }
    if (teamed) for (const u of units) row.push(fmt(scores[i].unit[u.id] ?? 0));
    rows.push(row);
  });
  const totalRow: (string | number)[] = ['TOTAL'];
  for (const p of match.players) totalRow.push('', '', fmt(totals.player[p.id] ?? 0));
  if (teamed) for (const u of units) totalRow.push(fmt(totals.unit[u.id] ?? 0));
  rows.push(totalRow);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function matchJson(match: Match): string {
  return JSON.stringify(
    { format: 'callbreak-scorekeeper-match', version: 1, exportedAt: new Date().toISOString(), match, summary: { winner: winnerLabel(match) } },
    null,
    2,
  );
}

export function backupJson(data: AppData): string {
  return JSON.stringify(buildBackup(data), null, 2);
}

export function matchFileName(match: Match, ext: string): string {
  const d = new Date(match.completedAt ?? match.startedAt).toISOString().slice(0, 10);
  return `callbreak-${slug(match.name)}-${d}.${ext}`;
}

/* ---------- downloads / native share ---------- */

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text: string, filename: string, mime: string) {
  downloadBlob(new Blob([text], { type: mime }), filename);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Uses the native share sheet when available. Returns 'shared' | 'cancelled' | 'unsupported'. */
export async function nativeShare(opts: { title: string; text: string; file?: File }): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unsupported';
  try {
    const data: ShareData = { title: opts.title, text: opts.text };
    if (opts.file && navigator.canShare?.({ files: [opts.file] })) data.files = [opts.file];
    await navigator.share(data);
    return 'shared';
  } catch (e) {
    return (e as DOMException)?.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}
