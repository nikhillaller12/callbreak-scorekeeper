import { useMemo, useState } from 'react';
import { computeOverallStats, computePlayerStats, computeTeamStats, countedMatches } from '../../domain/stats';
import { fmt } from '../../domain/util';
import { useStore } from '../../state/store';
import { BarList } from '../components/charts';
import { Avatar, Empty } from '../components/common';
import { Screen } from '../components/Screen';
import { go } from '../router';
import { Tile } from './Players';

const MEDALS = ['🥇', '🥈', '🥉'];

export function StatsScreen() {
  const { data } = useStore();
  const [tab, setTab] = useState<'players' | 'teams'>('players');
  const counted = useMemo(() => countedMatches(data.matches), [data.matches]);
  const overall = useMemo(() => computeOverallStats(data.matches), [data.matches]);
  const players = useMemo(() => computePlayerStats(data.matches), [data.matches]);
  const teams = useMemo(() => computeTeamStats(data.matches), [data.matches]);

  if (counted.length === 0) {
    return (
      <Screen title="Statistics">
        <Empty icon="🏆" title="No statistics yet">Finish a match and your numbers will show up here.
          <div style={{ marginTop: 12 }}><button type="button" className="btn primary" onClick={() => go('/new')}>▶ New match</button></div>
        </Empty>
      </Screen>
    );
  }

  const byWins = [...players].sort((a, b) => b.matchesWon - a.matchesWon || b.winRate - a.winRate || b.totalScore - a.totalScore);
  const byAvg = [...players].sort((a, b) => b.averageScore - a.averageScore);
  const mostCalls = [...players].sort((a, b) => b.successfulCalls - a.successfulCalls)[0];
  const bestPlayer = byWins[0];
  const teamsSorted = [...teams].sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.totalScore - a.totalScore);
  const winRate = (() => {
    const played = players.reduce((a, p) => a + p.matchesPlayed, 0);
    const won = players.reduce((a, p) => a + p.matchesWon, 0);
    return played ? Math.round((won / played) * 1000) / 10 : 0;
  })();

  return (
    <Screen title="Statistics">
      <div className="stack">
        <section aria-label="Overall">
          <h2 className="section-title">Overall</h2>
          <div className="stat-tiles cols3">
            <Tile k="Matches played" v={overall.matchesPlayed} />
            <Tile k="Total rounds" v={overall.roundsPlayed} />
            <Tile k="Total tricks" v={overall.totalTricks} />
            <Tile k="Calls made" v={`${overall.callSuccessRate}%`} s={`${overall.successfulCalls} of ${overall.totalCalls}`} />
            <Tile k="Avg round score" v={fmt(overall.averageRoundScore)} s="per player" />
            <Tile k="Avg win rate" v={`${winRate}%`} s="across players" />
          </div>
        </section>

        <section aria-label="Highlights">
          <h2 className="section-title">Highlights</h2>
          <div className="stat-tiles">
            <Tile k="🏅 Best player" v={bestPlayer?.name ?? '–'} s={bestPlayer ? `${bestPlayer.matchesWon} wins · ${bestPlayer.winRate}%` : undefined} />
            <Tile k="🔥 Highest score" v={overall.highestMatchScore ? fmt(overall.highestMatchScore.score) : '–'} s={overall.highestMatchScore ? `${overall.highestMatchScore.name} · ${overall.highestMatchScore.matchName}` : undefined} />
            <Tile k="🏆 Most wins" v={bestPlayer ? String(bestPlayer.matchesWon) : '–'} s={bestPlayer?.name} />
            <Tile k="🎯 Most successful calls" v={mostCalls ? String(mostCalls.successfulCalls) : '–'} s={mostCalls ? `${mostCalls.name} · ${mostCalls.callSuccessRate}%` : undefined} />
          </div>
        </section>

        <div className="tabs" role="tablist" aria-label="Leaderboards">
          <button type="button" role="tab" aria-selected={tab === 'players'} onClick={() => setTab('players')}>Players</button>
          <button type="button" role="tab" aria-selected={tab === 'teams'} onClick={() => setTab('teams')}>Teams</button>
        </div>

        {tab === 'players' ? (
          <>
            <section className="card" aria-label="Player leaderboard">
              <h2 className="section-title">Player leaderboard</h2>
              <ol className="rank-list">
                {byWins.map((p, i) => (
                  <li key={p.playerId}>
                    <span className="medal">{MEDALS[i] ?? i + 1}</span>
                    <Avatar avatar={p.avatar} name={p.name} size={38} />
                    <span className="who">{p.name}<small>{p.matchesWon}W · {p.matchesLost}L · {p.winRate}% · avg {fmt(p.averageScore)}</small></span>
                    <span className="val">{fmt(p.totalScore)}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section className="card" aria-label="Wins chart">
              <h2 className="section-title">Wins</h2>
              <BarList items={byWins.map((p) => ({ label: p.name, value: p.matchesWon, sub: `${p.matchesPlayed} played` }))} />
            </section>
            <section className="card" aria-label="Average score chart">
              <h2 className="section-title">Average score per match</h2>
              <BarList items={byAvg.map((p) => ({ label: p.name, value: p.averageScore }))} format={fmt} />
            </section>
            <section className="card" aria-label="Call success chart">
              <h2 className="section-title">Call success rate</h2>
              <BarList items={[...players].sort((a, b) => b.callSuccessRate - a.callSuccessRate).map((p) => ({ label: p.name, value: p.callSuccessRate, sub: `${p.successfulCalls} of ${p.totalCalls} calls · ${p.totalTricks} tricks` }))} format={(n) => `${n}%`} />
            </section>
          </>
        ) : teamsSorted.length === 0 ? (
          <Empty icon="👥" title="No team matches yet">Play a match in 2-team or 4-team mode.</Empty>
        ) : (
          <section className="card" aria-label="Team leaderboard">
            <h2 className="section-title">Team leaderboard</h2>
            <ol className="rank-list">
              {teamsSorted.map((t, i) => (
                <li key={t.key}>
                  <span className="medal">{MEDALS[i] ?? i + 1}</span>
                  <Avatar avatar={t.avatar} name={t.name} size={38} />
                  <span className="who">{t.name}<small>{t.wins}W · {t.losses}L · {t.winRate}% · avg {fmt(t.averageScore)}</small></span>
                  <span className="val">{fmt(t.totalScore)}</span>
                </li>
              ))}
            </ol>
            <div style={{ marginTop: 12 }}>
              <BarList items={teamsSorted.map((t) => ({ label: t.name, value: t.winRate, sub: `${t.matchesPlayed} played` }))} format={(n) => `${n}%`} />
            </div>
          </section>
        )}
      </div>
    </Screen>
  );
}
