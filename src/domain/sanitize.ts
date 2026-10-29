/**
 * Defensive parsing of anything that comes from storage or an imported file.
 * Never throws: invalid records are dropped (and counted) so one bad record cannot break the app.
 */
import { computeWinnerIds } from './match';
import { isValidCall, isValidTricks } from './scoring';
import {
  DEFAULT_SETTINGS,
  PLAYER_COUNT,
  type AppData,
  type Avatar,
  type GameMode,
  type Match,
  type MatchPlayer,
  type MatchTeam,
  type Player,
  type Round,
  type RoundDraft,
  type ScoringId,
  type Settings,
  type Team,
} from './types';
import { cleanText, uid } from './util';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const MAX_IMAGE_CHARS = 400_000;

export function sanitizeAvatar(v: unknown): Avatar {
  const o = isObj(v) ? v : {};
  const color = typeof o.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(o.color) ? o.color : '#2f7d5b';
  const avatar: Avatar = { color };
  if (typeof o.emoji === 'string' && o.emoji.trim()) avatar.emoji = Array.from(o.emoji.trim()).slice(0, 4).join('');
  if (typeof o.image === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(o.image) && o.image.length < MAX_IMAGE_CHARS) {
    avatar.image = o.image;
  }
  return avatar;
}

export function sanitizePlayer(v: unknown): Player | null {
  if (!isObj(v)) return null;
  const name = cleanText(v.name, 30);
  if (!name || typeof v.id !== 'string' || !v.id) return null;
  const now = Date.now();
  const p: Player = {
    id: v.id,
    name,
    avatar: sanitizeAvatar(v.avatar),
    createdAt: num(v.createdAt, now),
    updatedAt: num(v.updatedAt, num(v.createdAt, now)),
  };
  const nick = cleanText(v.nickname, 20);
  if (nick) p.nickname = nick;
  if (v.demo === true) p.demo = true;
  return p;
}

export function sanitizeTeam(v: unknown): Team | null {
  if (!isObj(v)) return null;
  const name = cleanText(v.name, 30);
  if (!name || typeof v.id !== 'string' || !v.id) return null;
  const now = Date.now();
  const ids = Array.isArray(v.playerIds) ? v.playerIds.filter((x): x is string => typeof x === 'string') : [];
  const t: Team = {
    id: v.id,
    name,
    avatar: sanitizeAvatar(v.avatar),
    playerIds: [...new Set(ids)],
    createdAt: num(v.createdAt, now),
    updatedAt: num(v.updatedAt, num(v.createdAt, now)),
  };
  if (v.demo === true) t.demo = true;
  return t;
}

const MODES: GameMode[] = ['individual', 'teams2', 'teams4'];
const SCORINGS: ScoringId[] = ['standard', 'whole'];

function sanitizeDraft(v: unknown): RoundDraft | undefined {
  if (!isObj(v)) return undefined;
  const arr = (a: unknown) =>
    Array.isArray(a) && a.length === PLAYER_COUNT ? a.map((x) => (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 13 ? x : 0)) : null;
  const calls = arr(v.calls);
  const tricks = arr(v.tricks);
  if (!calls || !tricks) return undefined;
  return { calls, tricks, step: v.step === 'tricks' ? 'tricks' : 'calls' };
}

/** Returns a clean Match or null when the record cannot be salvaged. */
export function sanitizeMatch(v: unknown): Match | null {
  if (!isObj(v) || typeof v.id !== 'string' || !v.id) return null;
  if (!Array.isArray(v.players) || v.players.length !== PLAYER_COUNT) return null;

  const seen = new Set<string>();
  const players: MatchPlayer[] = [];
  for (const raw of v.players) {
    if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id || seen.has(raw.id)) return null;
    const name = cleanText(raw.name, 30);
    if (!name) return null;
    seen.add(raw.id);
    const p: MatchPlayer = { id: raw.id, name, avatar: sanitizeAvatar(raw.avatar) };
    const nick = cleanText(raw.nickname, 20);
    if (nick) p.nickname = nick;
    if (typeof raw.teamId === 'string') p.teamId = raw.teamId;
    players.push(p);
  }

  const mode: GameMode = MODES.includes(v.mode as GameMode) ? (v.mode as GameMode) : 'individual';
  let teams: MatchTeam[] = [];
  if (mode !== 'individual' && Array.isArray(v.teams)) {
    const tseen = new Set<string>();
    const assigned = new Set<string>();
    for (const raw of v.teams) {
      if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id || tseen.has(raw.id)) return null;
      const name = cleanText(raw.name, 30);
      if (!name) return null;
      const ids = (Array.isArray(raw.playerIds) ? raw.playerIds : []).filter(
        (x): x is string => typeof x === 'string' && seen.has(x) && !assigned.has(x),
      );
      ids.forEach((i) => assigned.add(i));
      tseen.add(raw.id);
      const t: MatchTeam = { id: raw.id, name, avatar: sanitizeAvatar(raw.avatar), playerIds: ids };
      if (typeof raw.savedTeamId === 'string') t.savedTeamId = raw.savedTeamId;
      teams.push(t);
    }
    // Teams must cover every player, otherwise scores would silently disappear.
    if (assigned.size !== players.length || teams.some((t) => t.playerIds.length === 0)) return null;
  }
  if (mode !== 'individual' && teams.length === 0) return null;
  if (mode === 'individual') teams = [];
  for (const p of players) p.teamId = teams.find((t) => t.playerIds.includes(p.id))?.id;

  const rounds: Round[] = [];
  if (Array.isArray(v.rounds)) {
    for (const raw of v.rounds) {
      if (!isObj(raw) || !Array.isArray(raw.entries)) return null;
      const entries = [];
      for (const e of raw.entries) {
        if (!isObj(e) || typeof e.playerId !== 'string' || !seen.has(e.playerId)) return null;
        if (!isValidCall(e.call) || !isValidTricks(e.tricks)) return null;
        entries.push({ playerId: e.playerId, call: e.call as number, tricks: e.tricks as number });
      }
      if (entries.length !== players.length || new Set(entries.map((e) => e.playerId)).size !== players.length) return null;
      rounds.push({ roundNumber: rounds.length + 1, entries, createdAt: num(raw.createdAt, Date.now()) });
    }
  }

  const now = Date.now();
  const startedAt = num(v.startedAt, now);
  const match: Match = {
    id: v.id,
    name: cleanText(v.name, 60) || 'Call Break',
    mode,
    scoringId: SCORINGS.includes(v.scoringId as ScoringId) ? (v.scoringId as ScoringId) : 'standard',
    players,
    teams,
    rounds,
    status: v.status === 'completed' ? 'completed' : 'in_progress',
    startedAt,
    updatedAt: num(v.updatedAt, startedAt),
  };
  if (match.status === 'completed') match.completedAt = num(v.completedAt, match.updatedAt);
  const draft = match.status === 'in_progress' ? sanitizeDraft(v.draft) : undefined;
  if (draft) match.draft = draft;
  if (v.demo === true) match.demo = true;
  match.winnerIds = computeWinnerIds(match); // never trust a stored winner
  return match;
}

export function sanitizeSettings(v: unknown): Settings {
  const o = isObj(v) ? v : {};
  const bool = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
  return {
    soundEffects: bool(o.soundEffects, DEFAULT_SETTINGS.soundEffects),
    music: bool(o.music, DEFAULT_SETTINGS.music),
    muted: bool(o.muted, DEFAULT_SETTINGS.muted),
    theme: o.theme === 'light' ? 'light' : 'dark',
    defaultMode: MODES.includes(o.defaultMode as GameMode) ? (o.defaultMode as GameMode) : DEFAULT_SETTINGS.defaultMode,
    defaultScoring: SCORINGS.includes(o.defaultScoring as ScoringId) ? (o.defaultScoring as ScoringId) : DEFAULT_SETTINGS.defaultScoring,
    enforceThirteen: bool(o.enforceThirteen, DEFAULT_SETTINGS.enforceThirteen),
    entryStyle: o.entryStyle === 'steppers' ? 'steppers' : 'table',
    lastPlayerIds: Array.isArray(o.lastPlayerIds) ? o.lastPlayerIds.filter((x): x is string => typeof x === 'string').slice(0, 4) : [],
  };
}

export interface SanitizeReport {
  data: AppData;
  droppedPlayers: number;
  droppedTeams: number;
  droppedMatches: number;
}

function dedupe<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

/** Sanitise whole-database shaped input (also used for imports). */
export function sanitizeAppData(raw: unknown): SanitizeReport {
  const o = isObj(raw) ? raw : {};
  const rp = Array.isArray(o.players) ? o.players : [];
  const rt = Array.isArray(o.teams) ? o.teams : [];
  const rm = Array.isArray(o.matches) ? o.matches : [];
  const players = dedupe(rp.map(sanitizePlayer).filter((x): x is Player => !!x));
  const teams = dedupe(rt.map(sanitizeTeam).filter((x): x is Team => !!x));
  const matches = dedupe(rm.map(sanitizeMatch).filter((x): x is Match => !!x));
  return {
    data: { players, teams, matches, settings: sanitizeSettings(o.settings) },
    droppedPlayers: rp.length - players.length,
    droppedTeams: rt.length - teams.length,
    droppedMatches: rm.length - matches.length,
  };
}

/* ---------- backup file ---------- */

export const BACKUP_FORMAT = 'callbreak-scorekeeper-backup';
export const BACKUP_VERSION = 1;

export interface BackupFile extends AppData {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
}

export function buildBackup(data: AppData): BackupFile {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), ...data };
}

export type ParseResult =
  | { ok: true; report: SanitizeReport }
  | { ok: false; error: string };

export function parseBackup(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!isObj(json) || json.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'This is not a Call Break Scorekeeper backup file.' };
  }
  if (typeof json.version === 'number' && json.version > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of the app. Please update the app first.' };
  }
  const report = sanitizeAppData(json);
  if (report.data.players.length + report.data.teams.length + report.data.matches.length === 0) {
    return { ok: false, error: 'The backup contains no usable players, teams or matches.' };
  }
  return { ok: true, report };
}

/**
 * Merge `incoming` into `current` without ever deleting current data.
 * Records with an id that already exists are kept only if the incoming one is newer.
 */
export function mergeData(current: AppData, incoming: AppData): { data: AppData; added: number; updated: number } {
  let added = 0, updated = 0;
  const mergeList = <T extends { id: string; updatedAt: number }>(a: T[], b: T[]): T[] => {
    const map = new Map(a.map((i) => [i.id, i]));
    for (const item of b) {
      const ex = map.get(item.id);
      if (!ex) { map.set(item.id, item); added++; }
      else if (item.updatedAt > ex.updatedAt) { map.set(item.id, item); updated++; }
    }
    return [...map.values()];
  };
  return {
    data: {
      players: mergeList(current.players, incoming.players),
      teams: mergeList(current.teams, incoming.teams),
      matches: mergeList(current.matches, incoming.matches),
      settings: current.settings,
    },
    added,
    updated,
  };
}

export function newId(): string {
  return uid();
}
