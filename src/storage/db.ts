/**
 * Persistence layer. IndexedDB is the primary store; an in-memory adapter is used when IndexedDB is
 * unavailable (private mode, old browsers, tests) so the app still works for the current session.
 */
import { sanitizeAppData, sanitizeSettings, type SanitizeReport } from '../domain/sanitize';
import { DEFAULT_SETTINGS, type AppData, type Match, type Player, type Settings, type Team } from '../domain/types';

export interface StorageAdapter {
  readonly kind: 'indexeddb' | 'memory';
  /** Raw records; callers must sanitise. */
  loadRaw(): Promise<{ players: unknown[]; teams: unknown[]; matches: unknown[]; settings: unknown }>;
  putPlayer(p: Player): Promise<void>;
  deletePlayer(id: string): Promise<void>;
  putTeam(t: Team): Promise<void>;
  deleteTeam(id: string): Promise<void>;
  putMatch(m: Match): Promise<void>;
  deleteMatch(id: string): Promise<void>;
  putSettings(s: Settings): Promise<void>;
  /** Replace everything atomically (used by import-replace and clear). */
  replaceAll(d: AppData): Promise<void>;
}

const DB_NAME = 'callbreak-scorekeeper';
const DB_VERSION = 1;
const STORES = ['players', 'teams', 'matches', 'settings'] as const;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error('Transaction aborted'));
  });
}

export class IndexedDbAdapter implements StorageAdapter {
  readonly kind = 'indexeddb' as const;
  private constructor(private db: IDBDatabase) {}

  static open(factory: IDBFactory = indexedDB): Promise<IndexedDbAdapter> {
    return new Promise((resolve, reject) => {
      const r = factory.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const s of ['players', 'teams', 'matches']) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
      };
      r.onsuccess = () => resolve(new IndexedDbAdapter(r.result));
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('Database upgrade blocked'));
    });
  }

  private async all(store: string): Promise<unknown[]> {
    const tx = this.db.transaction(store, 'readonly');
    return req(tx.objectStore(store).getAll());
  }

  async loadRaw() {
    const [players, teams, matches] = await Promise.all([this.all('players'), this.all('teams'), this.all('matches')]);
    const tx = this.db.transaction('settings', 'readonly');
    const settings = await req(tx.objectStore('settings').get('settings'));
    return { players, teams, matches, settings };
  }

  private async put(store: string, value: unknown, key?: string) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    await done(tx);
  }
  private async del(store: string, id: string) {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(id);
    await done(tx);
  }

  putPlayer(p: Player) { return this.put('players', p); }
  deletePlayer(id: string) { return this.del('players', id); }
  putTeam(t: Team) { return this.put('teams', t); }
  deleteTeam(id: string) { return this.del('teams', id); }
  putMatch(m: Match) { return this.put('matches', m); }
  deleteMatch(id: string) { return this.del('matches', id); }
  putSettings(s: Settings) { return this.put('settings', s, 'settings'); }

  async replaceAll(d: AppData) {
    const tx = this.db.transaction([...STORES], 'readwrite');
    for (const s of STORES) tx.objectStore(s).clear();
    d.players.forEach((p) => tx.objectStore('players').put(p));
    d.teams.forEach((t) => tx.objectStore('teams').put(t));
    d.matches.forEach((m) => tx.objectStore('matches').put(m));
    tx.objectStore('settings').put(d.settings, 'settings');
    await done(tx);
  }
}

export class MemoryAdapter implements StorageAdapter {
  readonly kind = 'memory' as const;
  private d: AppData = { players: [], teams: [], matches: [], settings: DEFAULT_SETTINGS };
  async loadRaw() { return structuredClone(this.d); }
  private up<T extends { id: string }>(list: T[], v: T) {
    const i = list.findIndex((x) => x.id === v.id);
    if (i >= 0) list[i] = structuredClone(v); else list.push(structuredClone(v));
  }
  async putPlayer(p: Player) { this.up(this.d.players, p); }
  async deletePlayer(id: string) { this.d.players = this.d.players.filter((x) => x.id !== id); }
  async putTeam(t: Team) { this.up(this.d.teams, t); }
  async deleteTeam(id: string) { this.d.teams = this.d.teams.filter((x) => x.id !== id); }
  async putMatch(m: Match) { this.up(this.d.matches, m); }
  async deleteMatch(id: string) { this.d.matches = this.d.matches.filter((x) => x.id !== id); }
  async putSettings(s: Settings) { this.d.settings = structuredClone(s); }
  async replaceAll(d: AppData) { this.d = structuredClone(d); }
}

export async function openStorage(): Promise<StorageAdapter> {
  try {
    if (typeof indexedDB === 'undefined') return new MemoryAdapter();
    return await IndexedDbAdapter.open();
  } catch {
    return new MemoryAdapter();
  }
}

export interface LoadResult extends SanitizeReport {
  settingsOk: boolean;
}

/** Load + sanitise. Never throws: on failure returns empty data with a flag. */
export async function loadAll(adapter: StorageAdapter): Promise<LoadResult & { failed: boolean }> {
  try {
    const raw = await adapter.loadRaw();
    const report = sanitizeAppData(raw);
    report.data.settings = sanitizeSettings(raw.settings);
    return { ...report, settingsOk: !!raw.settings, failed: false };
  } catch {
    return {
      data: { players: [], teams: [], matches: [], settings: DEFAULT_SETTINGS },
      droppedPlayers: 0, droppedTeams: 0, droppedMatches: 0, settingsOk: false, failed: true,
    };
  }
}
