/** Core data model. Everything persisted is plain JSON. Totals are always derived from rounds. */

export type GameMode = 'individual' | 'teams2' | 'teams4';
export type ScoringId = 'standard' | 'whole';
export type MatchStatus = 'in_progress' | 'completed';
export type ThemeSetting = 'dark' | 'light';
/** How scores are entered during a match: typing into the score table, or call/tricks steppers. */
export type EntryStyle = 'table' | 'steppers';

export interface Avatar {
  /** Background colour (CSS hex). */
  color: string;
  /** Optional emoji shown instead of initials. */
  emoji?: string;
  /** Optional downscaled image as a data URL. */
  image?: string;
}

export interface Player {
  id: string;
  name: string;
  nickname?: string;
  avatar: Avatar;
  createdAt: number;
  updatedAt: number;
  demo?: boolean;
}

export interface Team {
  id: string;
  name: string;
  avatar: Avatar;
  playerIds: string[];
  createdAt: number;
  updatedAt: number;
  demo?: boolean;
}

/** Snapshot of a player at the time of the match (keeps history readable if the profile is deleted). */
export interface MatchPlayer {
  id: string;
  name: string;
  nickname?: string;
  avatar: Avatar;
  /** Match team id (team modes only). */
  teamId?: string;
}

export interface MatchTeam {
  id: string;
  name: string;
  avatar: Avatar;
  playerIds: string[];
  /** Link to a saved Team profile, if any. */
  savedTeamId?: string;
}

export interface RoundEntry {
  playerId: string;
  call: number;
  tricks: number;
}

export interface Round {
  roundNumber: number;
  entries: RoundEntry[];
  createdAt: number;
}

/** Unsaved in-progress round, kept so a match can be resumed mid-round. Arrays follow match.players order. */
export interface RoundDraft {
  calls: number[];
  tricks: number[];
  step: 'calls' | 'tricks';
}

export interface Match {
  id: string;
  name: string;
  mode: GameMode;
  scoringId: ScoringId;
  players: MatchPlayer[];
  teams: MatchTeam[];
  rounds: Round[];
  draft?: RoundDraft;
  status: MatchStatus;
  /** Cached winner unit ids (players in individual mode, teams otherwise). Recomputed on every mutation. */
  winnerIds?: string[];
  startedAt: number;
  completedAt?: number;
  updatedAt: number;
  demo?: boolean;
}

export interface Settings {
  soundEffects: boolean;
  music: boolean;
  /** Master mute (quick toggle in the header). Overrides soundEffects and music without losing them. */
  muted: boolean;
  theme: ThemeSetting;
  defaultMode: GameMode;
  defaultScoring: ScoringId;
  /** When true the tricks of a round must add up to 13 before it can be saved. */
  enforceThirteen: boolean;
  entryStyle: EntryStyle;
  /** Player ids used in the last match, to pre-fill the next setup. */
  lastPlayerIds: string[];
}

export interface AppData {
  players: Player[];
  teams: Team[];
  matches: Match[];
  settings: Settings;
}

/** A scoring entity: a player (individual mode) or a team. */
export interface Unit {
  id: string;
  name: string;
  avatar: Avatar;
  playerIds: string[];
  kind: 'player' | 'team';
}

export interface RoundValue {
  call: number;
  tricks: number;
}

export const MAX_CALL = 13;
export const MAX_TRICKS = 13;
export const TRICKS_PER_ROUND = 13;
export const PLAYER_COUNT = 4;

export const DEFAULT_SETTINGS: Settings = {
  soundEffects: true,
  music: false,
  muted: false,
  theme: 'dark',
  defaultMode: 'teams2',
  defaultScoring: 'standard',
  enforceThirteen: false,
  entryStyle: 'table',
  lastPlayerIds: [],
};
