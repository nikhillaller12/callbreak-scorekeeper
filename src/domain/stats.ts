/**
 * Statistics. Always derived from match data (never stored), so editing a round
 * automatically corrects every number.
 */
import { computeTotals, computeWinnerIds, getStandings, getUnits, scoreAllRounds } from './match';
import { isCallMade } from './scoring';
import type { Avatar, Match } from './types';
import { pct, sumScores } from './util';

export interface PlayerStats {
  playerId: string;
  name: string;
  avatar: Avatar;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  winRate: number;
  roundsPlayed: number;
  totalScore: number;
  /** Average of the player's personal total per match. */
  averageScore: number;
  bestMatchScore: number;
  totalTricks: number;
  /** Number of calls made during play (one per round). */
  totalCalls: number;
  successfulCalls: number;
  callSuccessRate: number;
  highestCall: number;
}

export interface TeamStats {
  key: string;
  name: string;
  avatar: Avatar;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalScore: number;
  averageScore: number;
}

export interface OverallStats {
  matchesPlayed: number;
  roundsPlayed: number;
  totalTricks: number;
  totalCalls: number;
  successfulCalls: number;
  callSuccessRate: number;
  /** Average personal round score across every player-round. */
  averageRoundScore: number;
  highestMatchScore: { name: string; score: number; matchName: string } | null;
}

export function countedMatches(matches: Match[]): Match[] {
  return matches.filter((m) => m.status === 'completed' && m.rounds.length > 0);
}

export function computePlayerStats(matches: Match[]): PlayerStats[] {
  const map = new Map<string, PlayerStats & { _scores: number[] }>();
  for (const m of countedMatches(matches)) {
    const winners = new Set(m.winnerIds ?? computeWinnerIds(m));
    const units = getUnits(m);
    const totals = computeTotals(m);
    for (const p of m.players) {
      let s = map.get(p.id);
      if (!s) {
        s = {
          playerId: p.id, name: p.name, avatar: p.avatar, matchesPlayed: 0, matchesWon: 0, matchesLost: 0,
          winRate: 0, roundsPlayed: 0, totalScore: 0, averageScore: 0, bestMatchScore: -Infinity, totalTricks: 0,
          totalCalls: 0, successfulCalls: 0, callSuccessRate: 0, highestCall: 0, _scores: [],
        };
        map.set(p.id, s);
      }
      // latest snapshot wins for display name / avatar
      s.name = p.name;
      s.avatar = p.avatar;
      s.matchesPlayed++;
      const unit = units.find((u) => u.playerIds.includes(p.id));
      if (unit && winners.has(unit.id)) s.matchesWon++;
      else s.matchesLost++;
      const mine = totals.player[p.id] ?? 0;
      s._scores.push(mine);
      s.bestMatchScore = Math.max(s.bestMatchScore, mine);
      for (const r of m.rounds) {
        const e = r.entries.find((x) => x.playerId === p.id);
        if (!e) continue;
        s.roundsPlayed++;
        s.totalTricks += e.tricks;
        s.totalCalls++;
        if (isCallMade(e.call, e.tricks)) s.successfulCalls++;
        s.highestCall = Math.max(s.highestCall, e.call);
      }
    }
  }
  return [...map.values()].map(({ _scores, ...s }) => ({
    ...s,
    totalScore: sumScores(_scores),
    averageScore: _scores.length ? Math.round((sumScores(_scores) / _scores.length) * 10) / 10 : 0,
    bestMatchScore: Number.isFinite(s.bestMatchScore) ? s.bestMatchScore : 0,
    winRate: pct(s.matchesWon, s.matchesPlayed),
    callSuccessRate: pct(s.successfulCalls, s.totalCalls),
  }));
}

export function computeTeamStats(matches: Match[]): TeamStats[] {
  const map = new Map<string, TeamStats & { _scores: number[] }>();
  for (const m of countedMatches(matches)) {
    if (m.mode === 'individual' || m.teams.length === 0) continue;
    const winners = new Set(m.winnerIds ?? computeWinnerIds(m));
    const totals = computeTotals(m);
    for (const t of m.teams) {
      const key = t.savedTeamId ?? 'name:' + t.name.trim().toLowerCase();
      let s = map.get(key);
      if (!s) {
        s = { key, name: t.name, avatar: t.avatar, matchesPlayed: 0, wins: 0, losses: 0, winRate: 0, totalScore: 0, averageScore: 0, _scores: [] };
        map.set(key, s);
      }
      s.name = t.name;
      s.avatar = t.avatar;
      s.matchesPlayed++;
      if (winners.has(t.id)) s.wins++;
      else s.losses++;
      s._scores.push(totals.unit[t.id] ?? 0);
    }
  }
  return [...map.values()].map(({ _scores, ...s }) => ({
    ...s,
    totalScore: sumScores(_scores),
    averageScore: _scores.length ? Math.round((sumScores(_scores) / _scores.length) * 10) / 10 : 0,
    winRate: pct(s.wins, s.matchesPlayed),
  }));
}

export function computeOverallStats(matches: Match[]): OverallStats {
  const counted = countedMatches(matches);
  let roundsPlayed = 0, totalTricks = 0, totalCalls = 0, successfulCalls = 0;
  const roundScores: number[] = [];
  let best: OverallStats['highestMatchScore'] = null;
  for (const m of counted) {
    roundsPlayed += m.rounds.length;
    const scores = scoreAllRounds(m);
    for (const r of m.rounds) {
      for (const e of r.entries) {
        totalTricks += e.tricks;
        totalCalls++;
        if (isCallMade(e.call, e.tricks)) successfulCalls++;
      }
    }
    for (const s of scores) roundScores.push(...Object.values(s.player));
    const totals = computeTotals(m);
    for (const p of m.players) {
      const sc = totals.player[p.id] ?? 0;
      if (!best || sc > best.score) best = { name: p.name, score: sc, matchName: m.name };
    }
  }
  return {
    matchesPlayed: counted.length,
    roundsPlayed,
    totalTricks,
    totalCalls,
    successfulCalls,
    callSuccessRate: pct(successfulCalls, totalCalls),
    averageRoundScore: roundScores.length ? Math.round((sumScores(roundScores) / roundScores.length) * 10) / 10 : 0,
    highestMatchScore: best,
  };
}

/* ---------- per-match summary ---------- */

export interface MatchSummary {
  rounds: number;
  standings: ReturnType<typeof getStandings>;
  bestRound: { unitName: string; score: number; roundNumber: number } | null;
  highestCall: { playerName: string; call: number; roundNumber: number; made: boolean } | null;
  mostSuccessfulCalls: { playerName: string; count: number } | null;
  mostTricks: { playerName: string; count: number } | null;
  longestStreak: { unitName: string; length: number } | null;
  players: {
    playerId: string;
    name: string;
    avatar: Avatar;
    total: number;
    tricks: number;
    calls: number;
    made: number;
    failed: number;
  }[];
}

export function summarizeMatch(match: Match): MatchSummary {
  const units = getUnits(match);
  const scores = scoreAllRounds(match);
  const totals = computeTotals(match);

  let bestRound: MatchSummary['bestRound'] = null;
  for (const s of scores) {
    for (const u of units) {
      const v = s.unit[u.id] ?? 0;
      if (!bestRound || v > bestRound.score) bestRound = { unitName: u.name, score: v, roundNumber: s.roundNumber };
    }
  }

  let highestCall: MatchSummary['highestCall'] = null;
  for (const r of match.rounds) {
    for (const e of r.entries) {
      if (!highestCall || e.call > highestCall.call) {
        highestCall = {
          playerName: match.players.find((p) => p.id === e.playerId)?.name ?? '?',
          call: e.call,
          roundNumber: r.roundNumber,
          made: isCallMade(e.call, e.tricks),
        };
      }
    }
  }

  const players = match.players.map((p) => {
    let tricks = 0, calls = 0, made = 0;
    for (const r of match.rounds) {
      const e = r.entries.find((x) => x.playerId === p.id);
      if (!e) continue;
      tricks += e.tricks;
      calls++;
      if (isCallMade(e.call, e.tricks)) made++;
    }
    return { playerId: p.id, name: p.name, avatar: p.avatar, total: totals.player[p.id] ?? 0, tricks, calls, made, failed: calls - made };
  });

  const topBy = (key: 'made' | 'tricks') => {
    const max = Math.max(0, ...players.map((p) => p[key]));
    if (max === 0) return null;
    const top = players.filter((p) => p[key] === max);
    return { playerName: top.map((p) => p.name).join(' & '), count: max };
  };
  const mostMade = topBy('made');
  const mostTricks = topBy('tricks');

  // Longest run of consecutive rounds where a unit had the strictly highest round score.
  const streaks: Record<string, { cur: number; best: number }> = {};
  for (const u of units) streaks[u.id] = { cur: 0, best: 0 };
  for (const s of scores) {
    const vals = units.map((u) => s.unit[u.id] ?? 0);
    const max = Math.max(...vals);
    const tops = units.filter((u) => (s.unit[u.id] ?? 0) === max);
    for (const u of units) {
      const st = streaks[u.id];
      if (tops.length === 1 && tops[0].id === u.id) {
        st.cur++;
        st.best = Math.max(st.best, st.cur);
      } else st.cur = 0;
    }
  }
  let longest: MatchSummary['longestStreak'] = null;
  for (const u of units) {
    const b = streaks[u.id].best;
    if (b >= 2 && (!longest || b > longest.length)) longest = { unitName: u.name, length: b };
  }

  return {
    rounds: match.rounds.length,
    standings: getStandings(match),
    bestRound,
    highestCall,
    mostSuccessfulCalls: mostMade ? { playerName: mostMade.playerName, count: mostMade.count } : null,
    mostTricks: mostTricks ? { playerName: mostTricks.playerName, count: mostTricks.count } : null,
    longestStreak: longest,
    players,
  };
}
