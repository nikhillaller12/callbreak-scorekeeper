import { getStandings, isTeamMatch, unitMembersLabel } from '../../domain/match';
import type { Match } from '../../domain/types';
import { fmt, formatDate } from '../../domain/util';
import { AvatarStack } from './common';
import type { ReactNode } from 'react';

export function matchVsLabel(match: Match): string {
  return getUnitsSorted(match).map((s) => s.unit.name).join(' vs ');
}
function getUnitsSorted(match: Match) {
  return getStandings(match);
}

export function MatchCard({ match, onOpen, menu }: { match: Match; onOpen: () => void; menu?: ReactNode }) {
  const st = getStandings(match);
  const teamed = isTeamMatch(match);
  const done = match.status === 'completed';
  const winners = st.filter((s) => s.rank === 1);
  const date = formatDate(match.completedAt ?? match.startedAt, { year: 'numeric', month: 'long', day: 'numeric' });
  const scoreLine = st.map((s) => fmt(s.total)).join(' – ');
  return (
    <div className="match-card" role="group" aria-label={match.name}>
      <button type="button" onClick={onOpen} className="btn ghost" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 18, opacity: 0, minHeight: 0 }} aria-label={`Open ${match.name}`} />
      <div className="mc-date">{date}{match.demo ? ' · demo' : ''}</div>
      <div className="mc-name">{match.name}</div>
      <div className="mc-vs">{st.map((s) => s.unit.name).join(teamed && st.length === 2 ? ' vs ' : ' · ')}</div>
      <div className="mc-meta">
        <AvatarStack size={26} items={st.slice(0, 4).map((s) => ({ avatar: s.unit.avatar, name: s.unit.name }))} />
        {done && match.rounds.length > 0 ? (
          <span className="badge gold">🏆 {winners.length > 1 ? 'Tie' : winners[0].unit.name}</span>
        ) : done ? (
          <span className="badge">No rounds</span>
        ) : (
          <span className="badge good">In progress</span>
        )}
        {match.rounds.length > 0 && <span className="mc-score">{scoreLine}</span>}
        <span className="hint">{match.rounds.length} round{match.rounds.length === 1 ? '' : 's'}</span>
      </div>
      {teamed && <div className="hint" style={{ marginTop: 4 }}>{st.map((s) => unitMembersLabel(match, s.unit)).join('  |  ')}</div>}
      {menu && <div className="mc-menu" style={{ zIndex: 2 }}>{menu}</div>}
    </div>
  );
}
