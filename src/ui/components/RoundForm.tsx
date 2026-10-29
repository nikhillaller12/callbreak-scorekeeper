import { useState } from 'react';
import { calculateScore } from '../../domain/scoring';
import { TRICKS_PER_ROUND, type Match } from '../../domain/types';
import { fmt, sumScores } from '../../domain/util';
import { getUnits, isTeamMatch } from '../../domain/match';
import { Avatar } from './common';
import { QuickPick, Stepper } from './Stepper';

export type FormMode = 'calls' | 'tricks' | 'both';

interface Props {
  match: Pick<Match, 'players' | 'teams' | 'mode' | 'scoringId'>;
  calls: number[];
  tricks: number[];
  mode: FormMode;
  onCall: (i: number, n: number) => void;
  onTricks: (i: number, n: number) => void;
}

/** One row per player. `calls` step = quick-pick calls, `tricks` step = quick-pick tricks (call shown), `both` = steppers only (editing). */
export function RoundForm({ match, calls, tricks, mode, onCall, onTricks }: Props) {
  const [active, setActive] = useState(0);
  const teamed = isTeamMatch(match as Match);
  const total = tricks.reduce((a, b) => a + b, 0);
  const advance = (i: number) => setActive(Math.min(match.players.length - 1, i + 1));

  const units = getUnits(match as Match);
  const unitOf = (pid: string) => units.find((u) => u.playerIds.includes(pid));
  const scoreOf = (i: number) => calculateScore(calls[i], tricks[i], match.scoringId);

  return (
    <div className="stack-sm">
      {match.players.map((p, i) => {
        const isActive = mode !== 'both' && active === i;
        const score = mode !== 'calls' ? scoreOf(i) : null;
        const made = score !== null && tricks[i] >= calls[i];
        return (
          <div
            key={p.id}
            className={'entry-row' + (isActive ? ' active' : '')}
            onFocusCapture={() => setActive(i)}
            onClick={(e) => {
              // A quick-pick tap advances to the next row itself; don't let the bubbling click undo that.
              if (!(e.target as HTMLElement).closest('.quick')) setActive(i);
            }}
          >
            <div className="entry-top">
              <Avatar avatar={p.avatar} name={p.name} size={40} />
              <div className="entry-name">
                {p.name}
                {teamed && <small>{unitOf(p.id)?.name}</small>}
              </div>
              {mode === 'tricks' && <div className="call-static" aria-label={`call ${calls[i]}`}>Call {calls[i]}</div>}
              {score !== null && (
                <div className={'preview ' + (made ? 'good' : 'bad')} aria-label={`score ${fmt(score)}, ${made ? 'call made' : 'call failed'}`}>
                  {made ? '✓' : '✗'} {fmt(score)}
                </div>
              )}
            </div>

            {mode === 'calls' && (
              <div className="entry-fields">
                <span className="entry-label">Call</span>
                <Stepper label={`${p.name} call`} value={calls[i]} onChange={(n) => onCall(i, n)} />
              </div>
            )}
            {mode === 'tricks' && (
              <div className="entry-fields">
                <span className="entry-label">Tricks won</span>
                <Stepper label={`${p.name} tricks`} value={tricks[i]} onChange={(n) => onTricks(i, n)} />
              </div>
            )}
            {mode === 'both' && (
              <div className="entry-fields">
                <span className="entry-label">Call</span>
                <Stepper label={`${p.name} call`} value={calls[i]} onChange={(n) => onCall(i, n)} />
                <span className="entry-label">Tricks</span>
                <Stepper label={`${p.name} tricks`} value={tricks[i]} onChange={(n) => onTricks(i, n)} />
              </div>
            )}

            {isActive && mode === 'calls' && (
              <QuickPick label={`${p.name} call`} value={calls[i]} onPick={(n) => { onCall(i, n); advance(i); }} />
            )}
            {isActive && mode === 'tricks' && (
              <QuickPick label={`${p.name} tricks`} value={tricks[i]} onPick={(n) => { onTricks(i, n); advance(i); }} />
            )}
          </div>
        );
      })}

      {mode !== 'calls' && (
        <div className={'tricks-meter' + (total > TRICKS_PER_ROUND ? ' over' : total === TRICKS_PER_ROUND ? ' exact' : '')} role="status">
          <span>Tricks {total} / {TRICKS_PER_ROUND}</span>
          <div className="bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (total / TRICKS_PER_ROUND) * 100)}%` }} /></div>
        </div>
      )}

      {mode !== 'calls' && teamed && (
        <div className="card flat" aria-label="Team round scores">
          {units.map((u) => (
            <div className="result-line" key={u.id}>
              <Avatar avatar={u.avatar} name={u.name} size={28} />
              <span className="nm"><b>{u.name}</b></span>
              <b className="num">{fmt(sumScores(u.playerIds.map((id) => scoreOf(match.players.findIndex((p) => p.id === id)))))}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
