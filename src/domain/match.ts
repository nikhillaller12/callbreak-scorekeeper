/**
 * Match logic: units, round scores, totals, winners and round editing.
 * Everything here is pure (inputs are never mutated) and totals are always derived from rounds.
 */
import { calculateScore, isCallMade, isValidCall, isValidTricks } from './scoring';
import {
  PLAYER_COUNT,
  TRICKS_PER_ROUND,
  type GameMode,
  type Match,
  type MatchPlayer,
  type MatchTeam,
  type Round,
  type RoundEntry,
  type ScoringId,
  type Unit,
} from './types';
import { cleanText, sumScores, uid } from './util';

/* ---------- units ---------- */

/** The scoring entities of a match: players (individual) or teams. */
export function getUnits(match: Pick<Match, 'mode' | 'players' | 'teams'>): Unit[] {
  if (match.mode === 'individual' || match.teams.length === 0) {
    return match.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      playerIds: [p.id],
      kind: 'player' as const,
    }));
  }
  return match.teams.map((t) => ({
    id: t.id,
    name: t.name,
    avatar: t.avatar,
    playerIds: t.playerIds,
    kind: 'team' as const,
  }));
}

export function isTeamMatch(match: Pick<Match, 'mode' | 'teams'>): boolean {
  return match.mode !== 'individual' && match.teams.length > 0;
}

/* ---------- scores ---------- */

export interface RoundScores {
  roundNumber: number;
  /** playerId -> score */
  player: Record<string, number>;
  /** unitId -> score (sum of members' scores) */
  unit: Record<string, number>;
}

export function scoreEntry(entry: RoundEntry, scoringId: ScoringId): number {
  return calculateScore(entry.call, entry.tricks, scoringId);
}

export function scoreRound(match: Match, round: Round): RoundScores {
  const player: Record<string, number> = {};
  for (const e of round.entries) player[e.playerId] = scoreEntry(e, match.scoringId);
  const unit: Record<string, number> = {};
  for (const u of getUnits(match)) {
    unit[u.id] = sumScores(u.playerIds.map((id) => player[id] ?? 0));
  }
  return { roundNumber: round.roundNumber, player, unit };
}

export function scoreAllRounds(match: Match): RoundScores[] {
  return match.rounds.map((r) => scoreRound(match, r));
}

export interface Totals {
  player: Record<string, number>;
  unit: Record<string, number>;
}

/** Totals after `upTo` rounds (default: all rounds). */
export function computeTotals(match: Match, upTo?: number): Totals {
  const limit = upTo ?? match.rounds.length;
  const scores = scoreAllRounds(match).slice(0, limit);
  const player: Record<string, number> = {};
  for (const p of match.players) player[p.id] = 0;
  const unit: Record<string, number> = {};
  for (const u of getUnits(match)) unit[u.id] = 0;
  const playerTenths: Record<string, number[]> = {};
  const unitTenths: Record<string, number[]> = {};
  for (const s of scores) {
    for (const [id, v] of Object.entries(s.player)) (playerTenths[id] ??= []).push(v);
    for (const [id, v] of Object.entries(s.unit)) (unitTenths[id] ??= []).push(v);
  }
  for (const id of Object.keys(player)) player[id] = sumScores(playerTenths[id] ?? []);
  for (const id of Object.keys(unit)) unit[id] = sumScores(unitTenths[id] ?? []);
  return { player, unit };
}

export interface Standing {
  unit: Unit;
  total: number;
  rank: number;
}

/** Ranked units, ties share a rank (competition ranking: 1,1,3). */
export function getStandings(match: Match, upTo?: number): Standing[] {
  const totals = computeTotals(match, upTo);
  const units = getUnits(match);
  const sorted = units
    .map((unit, i) => ({ unit, total: totals.unit[unit.id] ?? 0, i }))
    .sort((a, b) => b.total - a.total || a.i - b.i);
  const out: Standing[] = [];
  sorted.forEach((s, idx) => {
    const rank = idx > 0 && sorted[idx - 1].total === s.total ? out[idx - 1].rank : idx + 1;
    out.push({ unit: s.unit, total: s.total, rank });
  });
  return out;
}

/** Ids of the unit(s) with the top total. Empty when no rounds have been played. */
export function computeWinnerIds(match: Match): string[] {
  if (match.rounds.length === 0) return [];
  const st = getStandings(match);
  return st.filter((s) => s.rank === 1).map((s) => s.unit.id);
}

export function getLeaderIds(match: Match): string[] {
  return computeWinnerIds(match);
}

/** Cumulative unit totals after each round: [{round: 1, <unitId>: n}, ...] */
export function getProgression(match: Match): { round: number; totals: Record<string, number> }[] {
  const out: { round: number; totals: Record<string, number> }[] = [];
  for (let i = 1; i <= match.rounds.length; i++) {
    out.push({ round: match.rounds[i - 1].roundNumber, totals: computeTotals(match, i).unit });
  }
  return out;
}

/* ---------- validation ---------- */

export interface Validation {
  ok: boolean;
  errors: string[];
}

export function validateEntries(
  entries: RoundEntry[],
  players: Pick<MatchPlayer, 'id' | 'name'>[],
  opts: { enforceThirteen?: boolean; /** Skip the tricks-sum checks (table entry infers tricks from typed scores). */ ignoreTotal?: boolean } = {},
): Validation {
  const errors: string[] = [];
  const byId = new Map(entries.map((e) => [e.playerId, e]));
  for (const p of players) {
    const e = byId.get(p.id);
    if (!e) {
      errors.push(`${p.name}: missing entry`);
      continue;
    }
    if (!isValidCall(e.call)) errors.push(`${p.name}: call must be a whole number from 0 to 13`);
    if (!isValidTricks(e.tricks)) errors.push(`${p.name}: tricks must be a whole number from 0 to 13`);
  }
  if (entries.length !== players.length) errors.push('Each player needs exactly one entry');
  if (errors.length === 0 && !opts.ignoreTotal) {
    const total = entries.reduce((a, e) => a + e.tricks, 0);
    if (opts.enforceThirteen && total !== TRICKS_PER_ROUND) {
      errors.push(`Tricks add up to ${total}, but a round has ${TRICKS_PER_ROUND}`);
    } else if (total > TRICKS_PER_ROUND) {
      errors.push(`Tricks add up to ${total}, which is more than ${TRICKS_PER_ROUND}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/* ---------- match creation ---------- */

export interface MatchSetup {
  name?: string;
  mode: GameMode;
  scoringId: ScoringId;
  players: MatchPlayer[];
  teams: MatchTeam[];
}

export function defaultMatchName(ts = Date.now()): string {
  const d = new Date(ts);
  const day = d.toLocaleDateString(undefined, { weekday: 'long' });
  const hour = d.getHours();
  const part = hour < 5 ? 'Late Night' : hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night';
  return `${day} ${part} Call Break`;
}

export function validateSetup(setup: MatchSetup): Validation {
  const errors: string[] = [];
  if (setup.players.length !== PLAYER_COUNT) errors.push('Call Break needs exactly 4 players');
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const p of setup.players) {
    if (!cleanText(p.name)) errors.push('Every player needs a name');
    const key = cleanText(p.name).toLowerCase();
    if (key && names.has(key)) errors.push(`Duplicate player name: ${p.name}`);
    names.add(key);
    if (ids.has(p.id)) errors.push('The same player was picked twice');
    ids.add(p.id);
  }
  if (setup.mode !== 'individual') {
    if (setup.mode === 'teams2' && setup.teams.length !== 2) errors.push('2-team mode needs exactly 2 teams');
    if (setup.mode === 'teams4' && setup.teams.length !== 4) errors.push('4-team mode needs exactly 4 teams');
    const assigned = new Set<string>();
    for (const t of setup.teams) {
      if (!cleanText(t.name)) errors.push('Every team needs a name');
      if (t.playerIds.length === 0) errors.push(`${t.name || 'A team'} has no players`);
      t.playerIds.forEach((id) => assigned.add(id));
    }
    if (assigned.size !== setup.players.length) errors.push('Every player must belong to a team');
    const tn = setup.teams.map((t) => cleanText(t.name).toLowerCase());
    if (new Set(tn).size !== tn.length) errors.push('Team names must be different');
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function createMatch(setup: MatchSetup, now = Date.now()): Match {
  const teamed = setup.mode !== 'individual';
  const teams = teamed ? setup.teams.map((t) => ({ ...t, name: cleanText(t.name) })) : [];
  const players = setup.players.map((p) => ({
    ...p,
    name: cleanText(p.name),
    teamId: teamed ? teams.find((t) => t.playerIds.includes(p.id))?.id : undefined,
  }));
  return {
    id: uid(),
    name: cleanText(setup.name ?? '', 60) || defaultMatchName(now),
    mode: setup.mode,
    scoringId: setup.scoringId,
    players,
    teams,
    rounds: [],
    status: 'in_progress',
    startedAt: now,
    updatedAt: now,
  };
}

/* ---------- round editing (all return new matches) ---------- */

function withRounds(match: Match, rounds: Round[], now: number): Match {
  const next: Match = {
    ...match,
    rounds: rounds.map((r, i) => ({ ...r, roundNumber: i + 1 })),
    updatedAt: now,
  };
  next.winnerIds = computeWinnerIds(next);
  if (next.status === 'completed') next.completedAt = match.completedAt ?? now;
  return next;
}

export function makeRound(entries: RoundEntry[], roundNumber: number, now = Date.now()): Round {
  return {
    roundNumber,
    entries: entries.map((e) => ({ playerId: e.playerId, call: e.call, tricks: e.tricks })),
    createdAt: now,
  };
}

export function addRound(match: Match, entries: RoundEntry[], now = Date.now()): Match {
  const rounds = [...match.rounds, makeRound(entries, match.rounds.length + 1, now)];
  return { ...withRounds(match, rounds, now), draft: undefined };
}

export function updateRound(match: Match, roundNumber: number, entries: RoundEntry[], now = Date.now()): Match {
  const idx = match.rounds.findIndex((r) => r.roundNumber === roundNumber);
  if (idx < 0) return match;
  const rounds = match.rounds.map((r, i) => (i === idx ? { ...r, entries: makeRound(entries, r.roundNumber, r.createdAt).entries } : r));
  return withRounds(match, rounds, now);
}

export function deleteRound(match: Match, roundNumber: number, now = Date.now()): Match {
  const rounds = match.rounds.filter((r) => r.roundNumber !== roundNumber);
  return withRounds(match, rounds, now);
}

/** Remove the most recent round. */
export function undoLastRound(match: Match, now = Date.now()): Match {
  if (match.rounds.length === 0) return match;
  return deleteRound(match, match.rounds[match.rounds.length - 1].roundNumber, now);
}

export function finishMatch(match: Match, now = Date.now()): Match {
  const next: Match = { ...match, status: 'completed', completedAt: now, updatedAt: now, draft: undefined };
  next.winnerIds = computeWinnerIds(next);
  return next;
}

export function reopenMatch(match: Match, now = Date.now()): Match {
  return { ...match, status: 'in_progress', completedAt: undefined, updatedAt: now };
}

export function duplicateMatchSetup(match: Match, now = Date.now()): Match {
  return {
    ...match,
    id: uid(),
    name: `${match.name} (copy)`.slice(0, 60),
    rounds: match.rounds.map((r) => ({ ...r, entries: r.entries.map((e) => ({ ...e })) })),
    status: 'in_progress',
    completedAt: undefined,
    winnerIds: undefined,
    draft: undefined,
    startedAt: now,
    updatedAt: now,
    demo: undefined,
  };
}

/* ---------- helpers for UI ---------- */

export function winnerLabel(match: Match): string {
  const ids = match.winnerIds ?? computeWinnerIds(match);
  const units = getUnits(match).filter((u) => ids.includes(u.id));
  if (units.length === 0) return 'No winner yet';
  return units.map((u) => u.name).join(' & ');
}

export function unitMembersLabel(match: Match, unit: Unit): string {
  return unit.playerIds
    .map((id) => match.players.find((p) => p.id === id)?.name)
    .filter(Boolean)
    .join(' + ');
}

export { isCallMade };
