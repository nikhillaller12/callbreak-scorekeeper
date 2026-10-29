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
