import { describe, expect, it } from 'vitest';
import { demoData } from '../src/domain/demo';
import { addRound, createMatch } from '../src/domain/match';
import { buildBackup, mergeData, parseBackup, sanitizeAppData, sanitizeMatch } from '../src/domain/sanitize';
import { DEFAULT_SETTINGS, type AppData } from '../src/domain/types';

const av = { color: '#112233' };
const players = ['n', 'a', 'r', 'g'].map((id) => ({ id, name: id.toUpperCase(), avatar: av }));
const good = () => {
  let m = createMatch({ mode: 'individual', scoringId: 'standard', players, teams: [] });
  m = addRound(m, players.map((p) => ({ playerId: p.id, call: 2, tricks: 3 })));
  return m;
};
const data = (): AppData => ({ ...demoData(), settings: DEFAULT_SETTINGS });

describe('sanitize', () => {
  it('keeps a valid match and recomputes the winner', () => {
    const raw = JSON.parse(JSON.stringify({ ...good(), winnerIds: ['bogus'] }));
    const m = sanitizeMatch(raw)!;
    expect(m).not.toBeNull();
    expect(m.winnerIds).not.toContain('bogus');
  });
  it.each([
    ['null', null],
    ['no id', { players }],
    ['3 players', { ...good(), players: players.slice(0, 3) }],
    ['duplicate player ids', { ...good(), players: [players[0], players[0], players[2], players[3]] }],
    ['blank name', { ...good(), players: [{ ...players[0], name: '  ' }, ...players.slice(1)] }],
    ['NaN call', (() => { const m = JSON.parse(JSON.stringify(good())); m.rounds[0].entries[0].call = 'x'; return m; })()],
    ['call 14', (() => { const m = JSON.parse(JSON.stringify(good())); m.rounds[0].entries[0].call = 14; return m; })()],
    ['round for unknown player', (() => { const m = JSON.parse(JSON.stringify(good())); m.rounds[0].entries[0].playerId = 'zzz'; return m; })()],
    ['team mode with no teams', { ...good(), mode: 'teams2', teams: [] }],
  ])('rejects %s', (_n, raw) => {
    expect(sanitizeMatch(raw)).toBeNull();
  });
  it('drops bad avatars images and bad colors', () => {
    const raw = JSON.parse(JSON.stringify(good()));
    raw.players[0].avatar = { color: 'javascript:1', image: 'http://evil/x.png' };
    const m = sanitizeMatch(raw)!;
    expect(m.players[0].avatar.image).toBeUndefined();
    expect(m.players[0].avatar.color).toMatch(/^#/);
  });
  it('sanitizeAppData never throws on garbage and reports drops', () => {
    for (const junk of [null, undefined, 5, 'x', [], { players: 'no', matches: 7 }]) {
      expect(() => sanitizeAppData(junk)).not.toThrow();
    }
    const r = sanitizeAppData({ players: [{ id: 'a', name: 'A' }, { id: 'a', name: 'dup' }, { name: 'noid' }], matches: [good(), { bad: 1 }] });
    expect(r.data.players).toHaveLength(1);
    expect(r.droppedPlayers).toBe(2);
    expect(r.droppedMatches).toBe(1);
  });
});

describe('backup / import / merge', () => {
  it('round-trips', () => {
    const d = data();
    const res = parseBackup(JSON.stringify(buildBackup(d)));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.report.data.matches).toHaveLength(d.matches.length);
      expect(res.report.data.players).toHaveLength(4);
      expect(res.report.droppedMatches).toBe(0);
    }
  });
  it('rejects non-backups and invalid JSON', () => {
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup('{"hello":1}').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ format: 'callbreak-scorekeeper-backup', version: 99 })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ format: 'callbreak-scorekeeper-backup', version: 1 })).ok).toBe(false);
  });
  it('merge never deletes and prefers newer records', () => {
    const cur = data();
    const extra = good();
    const newer = { ...cur.matches[0], name: 'Renamed', updatedAt: cur.matches[0].updatedAt + 1000 };
    const older = { ...cur.matches[1], name: 'Stale', updatedAt: cur.matches[1].updatedAt - 1000 };
    const merged = mergeData(cur, { ...cur, matches: [newer, older, extra] });
    expect(merged.data.matches).toHaveLength(cur.matches.length + 1);
    expect(merged.data.matches.find((m) => m.id === newer.id)!.name).toBe('Renamed');
    expect(merged.data.matches.find((m) => m.id === older.id)!.name).not.toBe('Stale');
    expect(merged.added).toBe(1);
    expect(merged.updated).toBe(1);
  });
});

describe('demo data', () => {
  it('is entirely valid and flagged', () => {
    const d = demoData();
    const r = sanitizeAppData(d);
    expect(r.droppedMatches + r.droppedPlayers + r.droppedTeams).toBe(0);
    expect(d.matches.every((m) => m.demo)).toBe(true);
    expect(d.matches.filter((m) => m.status === 'completed')).toHaveLength(3);
  });
});
