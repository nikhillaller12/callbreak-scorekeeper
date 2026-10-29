import { useRef } from 'react';
import { getUnits, isTeamMatch, scoreRound } from '../../domain/match';
import { parseScoreText } from '../../domain/scoring';
import type { Match } from '../../domain/types';
import { fmt, sumScores } from '../../domain/util';

/** Score as a short typed string: 4.1, 5, -4. Used to prefill the entry row (e.g. after Undo). */
export function scoreText(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function toggleSign(text: string): string {
  const t = text.trim();
  if (t.startsWith('-')) return t.slice(1);
  return '-' + t.replace(/^\+/, '');
}

interface Props {
  match: Match;
  /** One string per match.players entry, in match.players order. */
  texts: string[];
  onText: (playerIndex: number, text: string) => void;
  onSubmit: () => void;
  onEdit?: (round: number) => void;
  /** Highlight cells that cannot be parsed. */
  showErrors: boolean;
}

/**
 * Table scorecard: one column per player (grouped by team), one row per round, and a final entry row
 * where the user just types the signed score (4.1, +5, -4). Totals update live as they type.
 */
export function ScoreSheet({ match, texts, onText, onSubmit, onEdit, showErrors }: Props) {
  const units = getUnits(match);
  const teamed = isTeamMatch(match);
  const grouped = teamed && units.some((u) => u.playerIds.length > 1);
  const order = (teamed ? units.flatMap((u) => u.playerIds) : match.players.map((p) => p.id))
    .map((id) => match.players.findIndex((p) => p.id === id))
    .filter((i) => i >= 0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const rows = match.rounds.map((r) => ({ r, s: scoreRound(match, r) }));
  const parsed = match.players.map((_, i) => (texts[i]?.trim() ? parseScoreText(texts[i], match.scoringId) : null));

  const playerTotal = (i: number): number => {
    const id = match.players[i].id;
    const p = parsed[i];
    return sumScores([...rows.map(({ s }) => s.player[id] ?? 0), p && p.ok ? p.score : 0]);
  };
  const totals = match.players.map((_, i) => playerTotal(i));
  const unitTotal = (u: (typeof units)[number]) => sumScores(u.playerIds.map((id) => totals[match.players.findIndex((p) => p.id === id)] ?? 0));
  const unitTotals = units.map(unitTotal);
  const best = Math.max(...(grouped ? unitTotals : totals));
  const hasScores = rows.length > 0 || parsed.some((p) => p?.ok);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>, pos: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = inputs.current[pos + 1];
    if (next) next.focus();
    else onSubmit();
  };

  return (
    <div className="table-wrap score-sheet">
      <table className="sheet-table">
        <caption className="sr-only">Scores by round. Type each player’s score for the new round in the last row.</caption>
        <thead>
          {grouped && (
            <tr className="team-head">
              <th scope="col" />
              {units.map((u) => <th scope="colgroup" colSpan={u.playerIds.length} key={u.id} title={u.name}>{u.avatar.emoji} {u.name}</th>)}
              {onEdit && <th scope="col" className="edit-cell" />}
            </tr>
          )}
          <tr>
            <th scope="col">#</th>
            {order.map((i) => <th scope="col" key={match.players[i].id} title={match.players[i].name}>{match.players[i].name}</th>)}
            {onEdit && <th scope="col" className="edit-cell"><span className="sr-only">Edit</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ r, s }) => (
            <tr key={r.roundNumber}>
              <td>{r.roundNumber}</td>
              {order.map((i) => {
                const v = s.player[match.players[i].id] ?? 0;
                return <td key={match.players[i].id} className={v < 0 ? 'neg' : ''}><b>{fmt(v)}</b></td>;
              })}
              {onEdit && (
                <td className="edit-cell">
                  <button type="button" className="edit-btn" aria-label={`Edit round ${r.roundNumber}`} onClick={() => onEdit(r.roundNumber)}>✏️</button>
                </td>
              )}
            </tr>
          ))}
          <tr className="entry-line">
            <td>{match.rounds.length + 1}</td>
            {order.map((i, pos) => {
              const p = parsed[i];
              const bad = showErrors && (!texts[i]?.trim() || (p !== null && !p.ok));
              return (
                <td key={match.players[i].id}>
                  <input
                    ref={(el) => { inputs.current[pos] = el; }}
                    id={`score-${match.players[i].id}`}
                    className="cell-in"
                    type="text"
                    inputMode="decimal"
                    enterKeyHint={pos === order.length - 1 ? 'done' : 'next'}
                    autoComplete="off"
                    maxLength={5}
                    placeholder="0"
                    aria-label={`${match.players[i].name} score, round ${match.rounds.length + 1}`}
                    aria-invalid={bad || undefined}
                    value={texts[i] ?? ''}
                    onChange={(e) => onText(i, e.target.value)}
                    onKeyDown={(e) => onKey(e, pos)}
                  />
                  <button
                    type="button"
                    className="sign-btn"
                    aria-label={`Switch ${match.players[i].name} between plus and minus`}
                    onClick={() => onText(i, toggleSign(texts[i] ?? ''))}
                  >
                    ＋/−
                  </button>
                </td>
              );
            })}
            {onEdit && <td className="edit-cell" />}
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td>
            {order.map((i) => (
              <td key={match.players[i].id} className={!grouped && hasScores && totals[i] === best ? 'scorecard-total-win' : ''}>{fmt(totals[i])}</td>
            ))}
            {onEdit && <td />}
          </tr>
          {grouped && (
            <tr className="team-total">
              <td>Team</td>
              {units.map((u, k) => (
                <td key={u.id} colSpan={u.playerIds.length} className={hasScores && unitTotals[k] === best ? 'scorecard-total-win' : ''}>
                  {fmt(unitTotals[k])}
                </td>
              ))}
              {onEdit && <td />}
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
}

/** Validation messages for the entry row, one per problem player. */
export function entryErrors(match: Match, texts: string[]): string[] {
  const out: string[] = [];
  match.players.forEach((p, i) => {
    const t = texts[i]?.trim() ?? '';
    if (!t) out.push(`${p.name}: enter a score`);
    else {
      const r = parseScoreText(t, match.scoringId);
      if (!r.ok) out.push(`${p.name}: ${r.error}`);
    }
  });
  return out;
}
