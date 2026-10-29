import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { demoData } from '../src/domain/demo';
import { IndexedDbAdapter, MemoryAdapter, loadAll } from '../src/storage/db';
import { DEFAULT_SETTINGS } from '../src/domain/types';

describe.each([
  ['indexeddb', () => IndexedDbAdapter.open()],
  ['memory', async () => new MemoryAdapter()],
])('storage adapter: %s', (_name, make) => {
  it('persists, updates and deletes records', async () => {
    const a = await make();
    await a.replaceAll({ players: [], teams: [], matches: [], settings: DEFAULT_SETTINGS });
    const d = demoData();
    for (const p of d.players) await a.putPlayer(p);
    for (const t of d.teams) await a.putTeam(t);
    for (const m of d.matches) await a.putMatch(m);
    await a.putSettings({ ...DEFAULT_SETTINGS, music: true, theme: 'light' });

    let r = await loadAll(a);
    expect(r.failed).toBe(false);
    expect(r.data.players).toHaveLength(4);
    expect(r.data.teams).toHaveLength(2);
    expect(r.data.matches).toHaveLength(4);
    expect(r.data.settings).toMatchObject({ music: true, theme: 'light' });

    await a.putMatch({ ...d.matches[0], name: 'Renamed' });
    await a.deleteMatch(d.matches[1].id);
    await a.deletePlayer(d.players[0].id);
    r = await loadAll(a);
    expect(r.data.matches).toHaveLength(3);
    expect(r.data.matches.find((m) => m.id === d.matches[0].id)!.name).toBe('Renamed');
    expect(r.data.players).toHaveLength(3);

    await a.replaceAll({ players: [], teams: [], matches: [], settings: DEFAULT_SETTINGS });
    expect((await loadAll(a)).data.matches).toHaveLength(0);
  });
});

describe('corrupted storage', () => {
  it('drops corrupted records but keeps valid ones, and reports them', async () => {
    const a = new MemoryAdapter();
    const d = demoData();
    await a.putMatch(d.matches[0]);
    await a.putMatch({ id: 'broken', players: 'nope' } as never);
    const r = await loadAll(a);
    expect(r.data.matches).toHaveLength(1);
    expect(r.droppedMatches).toBe(1);
  });
  it('loadAll never throws', async () => {
    const bad = { ...new MemoryAdapter(), loadRaw: async () => { throw new Error('boom'); } } as never;
    const r = await loadAll(bad);
    expect(r.failed).toBe(true);
    expect(r.data.matches).toEqual([]);
  });
});
