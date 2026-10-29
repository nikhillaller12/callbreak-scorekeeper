import { describe, expect, it } from 'vitest';
import { addRound, createMatch, finishMatch, updateRound } from '../src/domain/match';
import { computeOverallStats, computePlayerStats, computeTeamStats, summarizeMatch } from '../src/domain/stats';
import type { Match, MatchPlayer, RoundEntry } from '../src/domain/types';

const av = { color: '#123456' };
const players: MatchPlayer[] = ['n', 'a', 'r', 'g'].map((id) => ({ id, name: id.toUpperCase(), avatar: av }));
const teams = [
  { id: 'tA', name: 'Team A', avatar: av, playerIds: ['n', 'a'] },
  { id: 'tB', name: 'Team B', avatar: av, playerIds: ['r', 'g'] },
];
const e = (v: [number, number][]): RoundEntry[] => v.map(([call, tricks], i) => ({ playerId: players[i].id, call, tricks }));

function played(): Match {
  let m = createMatch({ mode: 'teams2', scoringId: 'standard', players, teams }, 1);
  m = addRound(m, e([[4, 5], [3, 3], [2, 1], [3, 4]])); // n4.1 a3 r-2 g3.1 | A7.1 B1.1
  m = addRound(m, e([[5, 5], [2, 2], [3, 3], [3, 3]])); // n5 a2 r3 g3 | A7 B6
  m = addRound(m, e([[6, 2], [2, 4], [3, 4], [2, 3]])); // n-6 a2.2 r3.1 g2.1 | A-3.8 B5.2
  return finishMatch(m, 99);
}

describe('player statistics', () => {
  it('counts calls, tricks, wins', () => {
    const stats = computePlayerStats([played()]);
    const n = stats.find((s) => s.playerId === 'n')!;
    expect(n.matchesPlayed).toBe(1);
    expect(n.totalCalls).toBe(3);
    expect(n.successfulCalls).toBe(2);
    expect(n.totalTricks).toBe(12);
    expect(n.totalScore).toBe(3.1); // 4.1 + 5 - 6
    expect(n.callSuccessRate).toBe(66.7);
    expect(n.highestCall).toBe(6);
    // Team A: 7.1+7-3.8 = 10.3 ; Team B: 1.1+6+5.2 = 12.3 -> B wins
    expect(n.matchesWon).toBe(0);
    expect(n.matchesLost).toBe(1);
    expect(stats.find((s) => s.playerId === 'r')!.matchesWon).toBe(1);
  });
  it('ignores unfinished matches and empty matches', () => {
    const m = played();
    expect(computePlayerStats([{ ...m, status: 'in_progress' }])).toEqual([]);
    expect(computePlayerStats([{ ...m, rounds: [] }])).toEqual([]);
  });
  it('recalculates after a round edit', () => {
    let m = played();
    expect(computePlayerStats([m]).find((s) => s.playerId === 'n')!.successfulCalls).toBe(2);
    m = updateRound(m, 3, e([[6, 6], [2, 4], [3, 4], [2, 3]]));
    const n = computePlayerStats([m]).find((s) => s.playerId === 'n')!;
    expect(n.successfulCalls).toBe(3);
    expect(n.totalScore).toBe(15.1);
    expect(m.winnerIds).toEqual(['tA']);
    expect(n.matchesWon).toBe(1);
  });
  it('aggregates across matches', () => {
    const stats = computePlayerStats([played(), played()]);
    expect(stats.find((s) => s.playerId === 'n')!.matchesPlayed).toBe(2);
    expect(stats.find((s) => s.playerId === 'n')!.totalScore).toBe(6.2);
    expect(stats.find((s) => s.playerId === 'n')!.averageScore).toBe(3.1);
  });
});

describe('team + overall statistics', () => {
  it('team wins/losses', () => {
    const t = computeTeamStats([played()]);
    expect(t.find((x) => x.name === 'Team B')).toMatchObject({ wins: 1, losses: 0, winRate: 100, totalScore: 12.3 });
    expect(t.find((x) => x.name === 'Team A')).toMatchObject({ wins: 0, losses: 1, totalScore: 10.3 });
  });
  it('individual matches produce no team stats', () => {
    const m = finishMatch(addRound(createMatch({ mode: 'individual', scoringId: 'standard', players, teams: [] }), e([[1, 1], [1, 1], [1, 1], [1, 1]])));
    expect(computeTeamStats([m])).toEqual([]);
  });
  it('overall', () => {
    const o = computeOverallStats([played()]);
    expect(o.matchesPlayed).toBe(1);
    expect(o.roundsPlayed).toBe(3);
    expect(o.totalCalls).toBe(12);
    expect(o.totalTricks).toBe(5 + 3 + 1 + 4 + 5 + 2 + 3 + 3 + 2 + 4 + 4 + 3);
    expect(o.highestMatchScore?.score).toBeGreaterThan(0);
  });
  it('empty input is safe', () => {
    expect(computeOverallStats([])).toMatchObject({ matchesPlayed: 0, averageRoundScore: 0, highestMatchScore: null });
  });
});

describe('match summary', () => {
  it('finds best round, highest call, most successful calls', () => {
    const s = summarizeMatch(played());
    expect(s.bestRound).toMatchObject({ unitName: 'Team A', score: 7.1, roundNumber: 1 });
    expect(s.highestCall).toMatchObject({ playerName: 'N', call: 6, made: false });
    expect(s.standings[0].unit.name).toBe('Team B');
    expect(s.mostSuccessfulCalls?.count).toBe(3); // a, r? a: made 3/3, r: 2/3, g:3/3
    expect(s.mostTricks?.count).toBeGreaterThan(0);
  });
  it('detects a winning streak of rounds', () => {
    let m = createMatch({ mode: 'teams2', scoringId: 'standard', players, teams });
    for (let i = 0; i < 3; i++) m = addRound(m, e([[5, 5], [5, 5], [1, 1], [1, 1]]));
    expect(summarizeMatch(m).longestStreak).toEqual({ unitName: 'Team A', length: 3 });
  });
});
