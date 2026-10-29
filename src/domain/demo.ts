/**
 * Optional demo data. Everything created here is flagged `demo: true`, so Settings → "Remove demo data"
 * (or deleting this file + its single import in Settings/Home) removes it cleanly before production.
 */
import { addRound, createMatch, finishMatch } from './match';
import type { AppData, Avatar, Match, Player, Round, Team } from './types';

const DAY = 86_400_000;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const av = (color: string, emoji?: string): Avatar => ({ color, emoji });

export function demoPlayers(now = Date.now()): Player[] {
  const mk = (id: string, name: string, color: string, emoji: string, nickname?: string): Player => ({
    id, name, nickname, avatar: av(color, emoji), createdAt: now - 60 * DAY, updatedAt: now - 60 * DAY, demo: true,
  });
  return [
    mk('demo-p-nikhil', 'Nikhil', '#c0392b', '🦁', 'Captain'),
    mk('demo-p-amit', 'Amit', '#2874a6', '🐯'),
    mk('demo-p-rahul', 'Rahul', '#7d3c98', '🦊', 'Fox'),
    mk('demo-p-gaurav', 'Gaurav', '#b9770e', '🐻'),
  ];
}

export function demoTeams(now = Date.now()): Team[] {
  return [
    { id: 'demo-t-a', name: 'Team A', avatar: av('#1e8449', '♠'), playerIds: ['demo-p-nikhil', 'demo-p-amit'], createdAt: now - 60 * DAY, updatedAt: now - 60 * DAY, demo: true },
    { id: 'demo-t-b', name: 'Team B', avatar: av('#a93226', '♥'), playerIds: ['demo-p-rahul', 'demo-p-gaurav'], createdAt: now - 60 * DAY, updatedAt: now - 60 * DAY, demo: true },
  ];
}

/** Deterministic plausible round: 13 tricks split across 4 players, calls close to the tricks. */
function fakeRounds(ids: string[], count: number, seed: number, start: number): Round[] {
  const rnd = mulberry32(seed);
  const rounds: Round[] = [];
  for (let r = 0; r < count; r++) {
    const tricks = [0, 0, 0, 0];
    for (let t = 0; t < 13; t++) tricks[Math.floor(rnd() * 4)]++;
    const entries = ids.map((playerId, i) => {
      const delta = Math.floor(rnd() * 3) - 1 + (rnd() < 0.25 ? 1 : 0);
      const call = Math.min(13, Math.max(1, tricks[i] + delta));
      return { playerId, call, tricks: tricks[i] };
    });
    rounds.push({ roundNumber: r + 1, entries, createdAt: start + r * 6 * 60_000 });
  }
  return rounds;
}

function buildMatch(opts: {
  id: string; name: string; mode: Match['mode']; daysAgo: number; rounds: number; seed: number; finished: boolean;
}, players: Player[], teams: Team[], now: number): Match {
  const started = now - opts.daysAgo * DAY;
  const teamed = opts.mode !== 'individual';
  let m = createMatch(
    {
      name: opts.name,
      mode: opts.mode,
      scoringId: 'standard',
      players: players.map((p) => ({ id: p.id, name: p.name, nickname: p.nickname, avatar: p.avatar })),
      teams: !teamed
        ? []
        : opts.mode === 'teams2'
          ? teams.map((t) => ({ id: 'm-' + t.id, name: t.name, avatar: t.avatar, playerIds: [...t.playerIds], savedTeamId: t.id }))
          : players.map((p) => ({ id: 'm-' + p.id, name: p.name, avatar: p.avatar, playerIds: [p.id] })),
    },
    started,
  );
  m = { ...m, id: opts.id, demo: true };
  const rounds = fakeRounds(players.map((p) => p.id), opts.rounds, opts.seed, started);
  for (const r of rounds) m = addRound(m, r.entries, r.createdAt);
  if (opts.finished) m = finishMatch(m, started + opts.rounds * 6 * 60_000 + 60_000);
  return m;
}

export function demoMatches(now = Date.now()): Match[] {
  const players = demoPlayers(now);
  const teams = demoTeams(now);
  return [
    buildMatch({ id: 'demo-m-1', name: 'Friday Night Call Break', mode: 'teams2', daysAgo: 2, rounds: 7, seed: 11, finished: true }, players, teams, now),
    buildMatch({ id: 'demo-m-2', name: 'Sunday Showdown', mode: 'teams2', daysAgo: 9, rounds: 13, seed: 42, finished: true }, players, teams, now),
    buildMatch({ id: 'demo-m-3', name: 'Every Man For Himself', mode: 'individual', daysAgo: 16, rounds: 5, seed: 7, finished: true }, players, teams, now),
    buildMatch({ id: 'demo-m-4', name: 'Lunch Break Game', mode: 'individual', daysAgo: 0, rounds: 3, seed: 99, finished: false }, players, teams, now),
  ];
}

export function demoData(now = Date.now()): Pick<AppData, 'players' | 'teams' | 'matches'> {
  return { players: demoPlayers(now), teams: demoTeams(now), matches: demoMatches(now) };
}
