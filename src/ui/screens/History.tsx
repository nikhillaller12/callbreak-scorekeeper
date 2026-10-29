import { useMemo, useState } from 'react';
import { computeTotals, computeWinnerIds, getUnits } from '../../domain/match';
import type { Match } from '../../domain/types';
import { useStore } from '../../state/store';
import { Empty, Field } from '../components/common';
import { MatchMenuButton } from '../components/MatchActions';
import { MatchCard } from '../components/MatchCard';
import { Screen } from '../components/Screen';
import { go } from '../router';

type FilterKind = 'all' | 'wins' | 'losses' | 'player' | 'team' | 'date';
type SortKind = 'newest' | 'oldest' | 'score' | 'rounds';

const FILTERS: { v: FilterKind; label: string }[] = [
  { v: 'all', label: 'All' },
  { v: 'wins', label: 'Wins' },
  { v: 'losses', label: 'Losses' },
  { v: 'player', label: 'Player' },
  { v: 'team', label: 'Team' },
  { v: 'date', label: 'Date' },
];

/** Did this player win? (their unit has the top total). null when the player isn't in the match or it has no rounds. */
function playerWon(m: Match, playerId: string): boolean | null {
  if (!m.players.some((p) => p.id === playerId) || m.rounds.length === 0) return null;
  const unit = getUnits(m).find((u) => u.playerIds.includes(playerId));
  return unit ? (m.winnerIds ?? computeWinnerIds(m)).includes(unit.id) : null;
}

export function topScore(m: Match): number {
  const t = computeTotals(m);
  return Math.max(...Object.values(t.unit), 0);
}

export function HistoryScreen() {
  const { data } = useStore();
  const [filter, setFilter] = useState<FilterKind>('all');
  const [sort, setSort] = useState<SortKind>('newest');
  const [playerId, setPlayerId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');

  const teamNames = useMemo(() => {
    const set = new Map<string, string>();
    data.matches.forEach((m) => m.teams.forEach((t) => set.set(t.name.trim().toLowerCase(), t.name)));
    return [...set.entries()];
  }, [data.matches]);
  const players = useMemo(() => {
    const map = new Map<string, string>();
    data.matches.forEach((m) => m.players.forEach((p) => map.set(p.id, p.name)));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data.matches]);

  const effPlayer = playerId || players[0]?.[0] || '';

  const list = useMemo(() => {
    let l = data.matches.filter((m) => {
      if (query && !m.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
      switch (filter) {
        case 'wins': return effPlayer ? playerWon(m, effPlayer) === true : false;
        case 'losses': return effPlayer ? playerWon(m, effPlayer) === false : false;
        case 'player': return m.players.some((p) => p.id === effPlayer);
        case 'team': return !teamName || m.teams.some((t) => t.name.trim().toLowerCase() === teamName);
        case 'date': {
          const ts = m.completedAt ?? m.startedAt;
          if (from && ts < new Date(from + 'T00:00:00').getTime()) return false;
          if (to && ts > new Date(to + 'T23:59:59.999').getTime()) return false;
          return true;
        }
        default: return true;
      }
    });
    const when = (m: Match) => m.completedAt ?? m.startedAt;
    l = [...l].sort((a, b) => {
      if (sort === 'oldest') return when(a) - when(b);
      if (sort === 'score') return topScore(b) - topScore(a);
      if (sort === 'rounds') return b.rounds.length - a.rounds.length;
      return when(b) - when(a);
    });
    return l;
  }, [data.matches, filter, sort, effPlayer, teamName, from, to, query]);

  return (
    <Screen title="Match history">
      <div className="stack">
        <Field label="Search by name">
          {(id) => <input id={id} type="search" value={query} placeholder="Search matches" onChange={(e) => setQuery(e.target.value)} />}
        </Field>

        <div className="chip-row" role="group" aria-label="Filter matches">
          {FILTERS.map((f) => (
            <button key={f.v} type="button" className="chip" aria-pressed={filter === f.v} onClick={() => setFilter(f.v)}>{f.label}</button>
          ))}
        </div>

        {(filter === 'wins' || filter === 'losses' || filter === 'player') && (
          <Field label="Player">
            {(id) => (
              <select id={id} value={effPlayer} onChange={(e) => setPlayerId(e.target.value)}>
                {players.map(([pid, name]) => <option key={pid} value={pid}>{name}</option>)}
              </select>
            )}
          </Field>
        )}
        {filter === 'team' && (
          <Field label="Team">
            {(id) => (
              <select id={id} value={teamName} onChange={(e) => setTeamName(e.target.value)}>
                <option value="">All team matches</option>
                {teamNames.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
              </select>
            )}
          </Field>
        )}
        {filter === 'date' && (
          <div className="filter-grid">
            <Field label="From">{(id) => <input id={id} type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />}</Field>
            <Field label="To">{(id) => <input id={id} type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />}</Field>
          </div>
        )}

        <Field label="Sort by">
          {(id) => (
            <select id={id} value={sort} onChange={(e) => setSort(e.target.value as SortKind)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="score">Highest score</option>
              <option value="rounds">Most rounds</option>
            </select>
          )}
        </Field>

        <div className="hint" aria-live="polite">{list.length} match{list.length === 1 ? '' : 'es'}</div>

        {list.length === 0 ? (
          data.matches.length === 0 ? (
            <Empty icon="📜" title="No matches yet">Your finished and unfinished matches will appear here.
              <div style={{ marginTop: 12 }}><button type="button" className="btn primary" onClick={() => go('/new')}>▶ Start a match</button></div>
            </Empty>
          ) : (
            <Empty icon="🔍" title="No matches found">Try a different filter.</Empty>
          )
        ) : (
          <div className="stack-sm">
            {list.map((m) => (
              <MatchCard key={m.id} match={m} onOpen={() => go(m.status === 'in_progress' ? `/play/${m.id}` : `/match/${m.id}`)} menu={<MatchMenuButton match={m} />} />
            ))}
          </div>
        )}
      </div>
    </Screen>
  );
}
