import { describe, expect, it } from 'vitest';
import { calculateScore, getScoringRule, isCallMade, parseScoreText } from '../src/domain/scoring';

describe('calculateScore (standard)', () => {
  it('made call exactly', () => {
    expect(calculateScore(4, 4)).toBe(4);
    expect(calculateScore(1, 1)).toBe(1);
    expect(calculateScore(13, 13)).toBe(13);
  });
  it('extra tricks add 0.1 each', () => {
    expect(calculateScore(4, 5)).toBe(4.1);
    expect(calculateScore(4, 6)).toBe(4.2);
    expect(calculateScore(3, 6)).toBe(3.3);
    expect(calculateScore(5, 13)).toBe(5.8);
  });
  it('failed call is minus the call', () => {
    expect(calculateScore(4, 3)).toBe(-4);
    expect(calculateScore(5, 4)).toBe(-5);
    expect(calculateScore(13, 0)).toBe(-13);
  });
  it('zero call / zero tricks', () => {
    expect(calculateScore(0, 0)).toBe(0);
    expect(Object.is(calculateScore(0, 0), -0)).toBe(false);
    expect(calculateScore(0, 2)).toBe(0.2);
  });
  it('has no floating point drift', () => {
    for (let c = 0; c <= 13; c++) {
      for (let t = c; t <= 13; t++) {
        const s = calculateScore(c, t);
        expect(Math.round(s * 10) / 10).toBe(s);
      }
    }
  });
  it('rejects invalid input', () => {
    expect(() => calculateScore(14, 0)).toThrow(RangeError);
    expect(() => calculateScore(-1, 0)).toThrow(RangeError);
    expect(() => calculateScore(2, 14)).toThrow(RangeError);
    expect(() => calculateScore(NaN, 1)).toThrow(RangeError);
    expect(() => calculateScore(1, Infinity)).toThrow(RangeError);
    expect(() => calculateScore(1.5, 2)).toThrow(RangeError);
  });
});

describe('alternate rule + helpers', () => {
  it('whole points rule ignores extra tricks', () => {
    expect(calculateScore(4, 6, 'whole')).toBe(4);
    expect(calculateScore(4, 3, 'whole')).toBe(-4);
  });
  it('falls back to standard for unknown ids', () => {
    expect(getScoringRule(undefined).id).toBe('standard');
  });
  it('isCallMade', () => {
    expect(isCallMade(4, 4)).toBe(true);
    expect(isCallMade(4, 3)).toBe(false);
  });
});

describe('parseScoreText (typed table entry)', () => {
  it('round-trips every score the standard rule can produce', () => {
    for (let call = 1; call <= 13; call++) {
      for (let tricks = 0; tricks <= 13; tricks++) {
        const score = calculateScore(call, tricks);
        const r = parseScoreText(String(score));
        // Failed calls are stored with tricks = 0, which still scores -call.
        expect(r.ok, `score ${score}`).toBe(true);
        if (r.ok) expect(r.score).toBe(score);
      }
    }
  });
  it('accepts made calls with an optional plus sign', () => {
    expect(parseScoreText('4.1')).toMatchObject({ ok: true, call: 4, tricks: 5, score: 4.1 });
    expect(parseScoreText('+5')).toMatchObject({ ok: true, call: 5, tricks: 5, score: 5 });
    expect(parseScoreText('0')).toMatchObject({ ok: true, call: 0, tricks: 0, score: 0 });
    expect(parseScoreText('4,2')).toMatchObject({ ok: true, call: 4, tricks: 6, score: 4.2 });
  });
  it('treats a negative score as a failed call', () => {
    const r = parseScoreText('-4');
    expect(r).toMatchObject({ ok: true, call: 4, score: -4 });
    expect(r.ok && r.tricks < r.call).toBe(true);
    expect(parseScoreText('\u22125')).toMatchObject({ ok: true, call: 5, score: -5 });
  });
  it('rejects invalid input', () => {
    for (const bad of ['', '  ', 'abc', '4.12', '-4.1', '14', '13.1', '5.9', '--3', '1e3', 'NaN', 'Infinity']) {
      expect(parseScoreText(bad).ok, bad).toBe(false);
    }
  });
  it('rejects scores the active rule cannot produce', () => {
    expect(parseScoreText('4.1', 'whole').ok).toBe(false);
    expect(parseScoreText('4', 'whole')).toMatchObject({ ok: true, call: 4, score: 4 });
  });
});
