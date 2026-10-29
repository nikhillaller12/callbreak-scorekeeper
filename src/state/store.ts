/**
 * Application store: a tiny external store (no extra dependencies) that keeps the whole dataset in memory
 * and writes every change through to storage. Consumed with `useStore`.
 */
import { useSyncExternalStore } from 'react';
import { demoData } from '../domain/demo';
import { mergeData } from '../domain/sanitize';
import { DEFAULT_SETTINGS, type AppData, type Match, type Player, type Settings, type Team } from '../domain/types';
import { loadAll, openStorage, type StorageAdapter } from '../storage/db';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'success';
}

export interface StoreState {
  ready: boolean;
  data: AppData;
  storageKind: 'indexeddb' | 'memory';
  /** Records that could not be read from storage on startup. */
  loadProblem: { dropped: number; failed: boolean } | null;
  toasts: Toast[];
}

const EMPTY: AppData = { players: [], teams: [], matches: [], settings: DEFAULT_SETTINGS };

let state: StoreState = { ready: false, data: EMPTY, storageKind: 'memory', loadProblem: null, toasts: [] };
let adapter: StorageAdapter | null = null;
const listeners = new Set<() => void>();
let toastId = 1;

function set(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function setData(patch: Partial<AppData>) {
  set({ data: { ...state.data, ...patch } });
}

export function toast(message: string, kind: Toast['kind'] = 'info') {
  const t = { id: toastId++, message, kind };
  set({ toasts: [...state.toasts, t] });
  setTimeout(() => set({ toasts: state.toasts.filter((x) => x.id !== t.id) }), kind === 'error' ? 5000 : 2600);
}

/** Run a persistence write; on failure tell the user (data stays in memory for this session). */
async function persist(fn: (a: StorageAdapter) => Promise<void>) {
  if (!adapter) return;
  try {
    await fn(adapter);
  } catch (e) {
    console.error(e);
    toast('Could not save to this device. Export a backup soon!', 'error');
  }
}

export async function initStore(): Promise<void> {
  adapter = await openStorage();
  const r = await loadAll(adapter);
  const dropped = r.droppedMatches + r.droppedPlayers + r.droppedTeams;
  set({
    ready: true,
    data: r.data,
    storageKind: adapter.kind,
    loadProblem: dropped > 0 || r.failed ? { dropped, failed: r.failed } : null,
  });
  if (adapter.kind === 'memory') {
    toast('Storage is unavailable here, so data will be lost when you close the page.', 'error');
  }
}

/** For tests / e2e. */
export function getState(): StoreState {
  return state;
}

export function dismissLoadProblem() {
  set({ loadProblem: null });
}

/* ---------- actions ---------- */

export const actions = {
  savePlayer(p: Player) {
    const list = state.data.players;
    const next = list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p];
    setData({ players: next });
    return persist((a) => a.putPlayer(p));
  },
  deletePlayer(id: string) {
    const affected = state.data.teams
      .filter((t) => t.playerIds.includes(id))
      .map((t) => ({ ...t, playerIds: t.playerIds.filter((x) => x !== id), updatedAt: Date.now() }));
    setData({
      players: state.data.players.filter((p) => p.id !== id),
      teams: state.data.teams.map((t) => affected.find((x) => x.id === t.id) ?? t),
    });
    return persist(async (a) => {
      await a.deletePlayer(id);
      for (const t of affected) await a.putTeam(t);
    });
  },
  saveTeam(t: Team) {
    const list = state.data.teams;
    setData({ teams: list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t] });
    return persist((a) => a.putTeam(t));
  },
  deleteTeam(id: string) {
    setData({ teams: state.data.teams.filter((t) => t.id !== id) });
    return persist((a) => a.deleteTeam(id));
  },
  saveMatch(m: Match) {
    const list = state.data.matches;
    setData({ matches: list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m] });
    return persist((a) => a.putMatch(m));
  },
  deleteMatch(id: string) {
    setData({ matches: state.data.matches.filter((m) => m.id !== id) });
    return persist((a) => a.deleteMatch(id));
  },
  updateSettings(patch: Partial<Settings>) {
    const s = { ...state.data.settings, ...patch };
    setData({ settings: s });
    return persist((a) => a.putSettings(s));
  },
  async replaceAll(d: AppData) {
    set({ data: d });
    await persist((a) => a.replaceAll(d));
  },
  async mergeIn(incoming: AppData) {
    const merged = mergeData(state.data, incoming);
    set({ data: merged.data });
    await persist((a) => a.replaceAll(merged.data));
    return merged;
  },
  async clearAll() {
    const d = { ...EMPTY, settings: state.data.settings };
    set({ data: d });
    await persist((a) => a.replaceAll(d));
  },
  async loadDemo() {
    const d = demoData();
    const ids = new Set(state.data.players.map((p) => p.id));
    const merged: AppData = {
      ...state.data,
      players: [...state.data.players, ...d.players.filter((p) => !ids.has(p.id))],
      teams: [...state.data.teams, ...d.teams.filter((t) => !state.data.teams.some((x) => x.id === t.id))],
      matches: [...state.data.matches, ...d.matches.filter((m) => !state.data.matches.some((x) => x.id === m.id))],
    };
    set({ data: merged });
    await persist((a) => a.replaceAll(merged));
  },
  async removeDemo() {
    const d = state.data;
    const next: AppData = {
      ...d,
      players: d.players.filter((p) => !p.demo),
      teams: d.teams.filter((t) => !t.demo),
      matches: d.matches.filter((m) => !m.demo),
    };
    set({ data: next });
    await persist((a) => a.replaceAll(next));
  },
};

/* ---------- hooks ---------- */

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, () => state);
}
