/**
 * Scoring engine. All score maths lives here; the UI only calls `calculateScore`
 * (or `getScoringRule(id).score`). To add a new rule set, add an entry to SCORING_RULES.
 */
import { MAX_CALL, MAX_TRICKS, type ScoringId } from './types';
import { isInt } from './util';

export interface ScoringRule {
  id: ScoringId;
  name: string;
  description: string;
  /** Inputs are pre-validated integers in range. */
  score(call: number, tricks: number): number;
}

const standard: ScoringRule = {
  id: 'standard',
  name: 'Standard',
  description: 'Made call: call + 0.1 per extra trick. Failed call: minus the call.',
  score(call, tricks) {
    if (tricks >= call) {
      // integer tenths avoid floating point drift (e.g. 4 + 3 * 0.1)
      return (call * 10 + (tricks - call)) / 10;
    }
    return -call;
  },
};

const whole: ScoringRule = {
  id: 'whole',
  name: 'Whole points',
  description: 'Made call: exactly the call (extra tricks ignored). Failed call: minus the call.',
  score(call, tricks) {
    return tricks >= call ? call : -call;
  },
};

export const SCORING_RULES: Record<ScoringId, ScoringRule> = { standard, whole };

export function getScoringRule(id: ScoringId | undefined): ScoringRule {
  return (id && SCORING_RULES[id]) || standard;
}

export function isValidCall(n: unknown): n is number {
  return isInt(n) && n >= 0 && n <= MAX_CALL;
}

export function isValidTricks(n: unknown): n is number {
  return isInt(n) && n >= 0 && n <= MAX_TRICKS;
}

/** Throws RangeError on invalid input so NaN / Infinity can never leak into a score. */
export function calculateScore(call: number, tricks: number, ruleId: ScoringId = 'standard'): number {
  if (!isValidCall(call)) throw new RangeError(`Call must be a whole number from 0 to ${MAX_CALL}`);
  if (!isValidTricks(tricks)) throw new RangeError(`Tricks must be a whole number from 0 to ${MAX_TRICKS}`);
  return getScoringRule(ruleId).score(call, tricks);
}

export function isCallMade(call: number, tricks: number): boolean {
  return tricks >= call;
}

export type ScoreParse = { ok: true; call: number; tricks: number; score: number } | { ok: false; error: string };

/**
 * Table-entry helper: turns a typed signed score ("4.1", "+5", "-4") into the call/tricks pair that produces it,
 * so the round is still stored (and every total, winner and stat is still derived) from call + tricks.
 * A failed call (negative score) is stored as `tricks = 0` because the real trick count is unknown.
 */
export function parseScoreText(raw: string, ruleId: ScoringId = 'standard'): ScoreParse {
  const text = raw.trim().replace(/[\u2212\u2013]/g, '-').replace(',', '.');
  if (text === '') return { ok: false, error: 'enter a score' };
  const m = /^([+-]?)(\d{1,2})(?:\.(\d))?$/.exec(text);
  if (!m) return { ok: false, error: 'use a score like 4.1, 5 or -4' };
  const negative = m[1] === '-';
  const whole = Number(m[2]);
  const tenth = m[3] ? Number(m[3]) : 0;
  let call: number;
  let tricks: number;
  if (negative && (whole > 0 || tenth > 0)) {
    if (tenth !== 0) return { ok: false, error: 'a failed call is a whole number, like -4' };
    call = whole;
    tricks = 0;
  } else {
    call = whole;
    tricks = whole + tenth;
  }
  if (!isValidCall(call)) return { ok: false, error: `a call can't be more than ${MAX_CALL}` };
  if (!isValidTricks(tricks)) return { ok: false, error: `tricks can't be more than ${MAX_TRICKS}` };
  const score = calculateScore(call, tricks, ruleId);
  const expected = negative && (whole > 0 || tenth > 0) ? -(whole + tenth / 10) : whole + tenth / 10;
  if (Math.abs(score - expected) > 1e-9) return { ok: false, error: `${text} isn't possible with ${getScoringRule(ruleId).name} scoring` };
  return { ok: true, call, tricks, score };
}
