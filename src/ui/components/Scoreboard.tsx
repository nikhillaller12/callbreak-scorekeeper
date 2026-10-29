import { useEffect, useRef, useState } from 'react';
import { computeTotals, getStandings, isTeamMatch, scoreRound, unitMembersLabel } from '../../domain/match';
import type { Match } from '../../domain/types';
import { fmt, fmtSigned } from '../../domain/util';
import { play } from '../../audio/audio';
import { Avatar } from './common';

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];

export function Scoreboard({ match, live }: { match: Match; live?: boolean }) {
  const standings = getStandings(match);
  const teamed = isTeamMatch(match);
  const totals = computeTotals(match);
  const last = match.rounds[match.rounds.length - 1];
  const lastScores = last ? scoreRound(match, last) : null;
  const leaders = standings.filter((s) => s.rank === 1);
  const hasRounds = match.rounds.length > 0;
  const topScore = standings[0]?.total ?? 0;

  // Leader change: flash + sound (only when rounds were added during this view)
  const prevLeader = useRef<string>('');
  const prevCount = useRef(match.rounds.length);
  const [flashId, setFlashId] = useState<string | null>(null);
  const leaderKey = hasRounds ? leaders.map((l) => l.unit.id).join('|') : '';
  useEffect(() => {
    if (live && hasRounds && prevLeader.current && leaderKey !== prevLeader.current && match.rounds.length > prevCount.current) {
      setFlashId(leaderKey);
      play('leader');
      const t = setTimeout(() => setFlashId(null), 1000);
      prevLeader.current = leaderKey;
      prevCount.current = match.rounds.length;
      return () => clearTimeout(t);
    }
    prevLeader.current = leaderKey;
    prevCount.current = match.rounds.length;
  }, [leaderKey, live, hasRounds, match.rounds.length]);

  return (
    <section className="card scoreboard" aria-label="Scoreboard">
      <div className="sb-head">
        <span className="title">♠ CALL BREAK</span>
        <span className="sb-round" aria-live="polite">{match.status === 'completed' ? 'Final' : `Round ${match.rounds.length + 1}`}</span>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {standings.map((s) => {
          const lead = hasRounds && s.rank === 1;
          const delta = lastScores?.unit[s.unit.id];
          return (
            <li key={s.unit.id}>
              <div className={'sb-row' + (lead ? ' lead' : '') + (lead && flashId ? ' leader-flash' : '')}>
                <span className="sb-rank" aria-label={`Rank ${s.rank}`}>{hasRounds ? (MEDALS[s.rank - 1] ?? s.rank) : '–'}</span>
                {teamed ? (
                  <Avatar avatar={s.unit.avatar} name={s.unit.name} size={40} ring={lead} />
                ) : (
                  <Avatar avatar={s.unit.avatar} name={s.unit.name} size={40} ring={lead} />
                )}
                <div className="sb-name">
                  <b>{s.unit.name}</b>
                  {teamed && <small>{unitMembersLabel(match, s.unit)}</small>}
                </div>
                <div className="sb-total">
                  <b key={s.total} className={live ? 'pop' : ''}>{fmt(s.total)}</b>
                  {delta !== undefined && (
                    <small className={delta >= 0 ? 'up' : 'down'} aria-label={`last round ${fmtSigned(delta)}`}>{fmtSigned(delta)}</small>
                  )}
                </div>
              </div>
              {teamed && (
                <div className="sb-members">
                  {s.unit.playerIds.map((pid) => {
                    const p = match.players.find((x) => x.id === pid);
                    if (!p) return null;
                    const d = lastScores?.player[pid];
                    return (
                      <span key={pid}>
                        {p.name}: <b className="num">{fmt(totals.player[pid] ?? 0)}</b>
                        {d !== undefined && <span className="hint"> ({fmtSigned(d)})</span>}
                      </span>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="sb-foot">
        {!hasRounds
          ? 'Enter the first round to start scoring'
          : leaders.length > 1
            ? `🤝 Tied at ${fmt(topScore)}`
            : `🏆 ${leaders[0].unit.name} ${match.status === 'completed' ? 'WON' : 'LEADING'}`}
      </div>
    </section>
  );
}
