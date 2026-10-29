import { describe, expect, it } from 'vitest';
import {
  addRound, computeTotals, computeWinnerIds, createMatch, deleteRound, duplicateMatchSetup, finishMatch,
  getStandings, scoreRound, undoLastRound, updateRound, validateEntries, validateSetup,
} from '../src/domain/match';
import type { Match, MatchPlayer, RoundEntry } from '../src/domain/types';

const av = { color: '#123456' };
const players: MatchPlayer[] = [
  { id: 'n', name: 'Nikhil', avatar: av },
  { id: 'a', name: 'Amit', avatar: av },
  { id: 'r', name: 'Rahul', avatar: av },
  { id: 'g', name: 'Gaurav', avatar: av },
];
const teams = [
  { id: 'tA', name: 'Team A', avatar: av, playerIds: ['n', 'a'] },
  { id: 'tB', name: 'Team B', avatar: av, playerIds: ['r', 'g'] },
];
const entries = (v: [number, number][]): RoundEntry[] => v.map(([call, tricks], i) => ({ playerId: players[i].id, call, tricks }));

function teamMatch(): Match {
  return createMatch({ mode: 'teams2', scoringId: 'standard', players, teams }, 1000);
}

describe('team scoring', () => {
  it('sums individual scores into team scores (spec example)', () => {
    // Nikhil 4.2, Amit 3.1 -> 7.3 ; Rahul 5, Gaurav 2.2 -> 7.2
    let m = teamMatch();
    m = addRound(m, entries([[4, 6], [3, 4], [5, 5], [2, 4]]));
    const s = scoreRound(m, m.rounds[0]);
    expect(s.player).toEqual({ n: 4.2, a: 3.1, r: 5, g: 2.2 });
    expect(s.unit.tA).toBe(7.3);
    expect(s.unit.tB).toBe(7.2);
    expect(m.winnerIds).toEqual(['tA']);
  });
  it('failed calls subtract from team', () => {
    let m = teamMatch();
    m = addRound(m, entries([[4, 4], [3, 2], [5, 5], [2, 2]]));
    expect(scoreRound(m, m.rounds[0]).unit.tA).toBe(1);
    expect(scoreRound(m, m.rounds[0]).unit.tB).toBe(7);
  });
  it('individual mode uses players as units', () => {
    let m = createMatch({ mode: 'individual', scoringId: 'standard', players, teams: [] });
    m = addRound(m, entries([[4, 5], [3, 3], [5, 4], [2, 3]]));
    expect(getStandings(m).map((s) => s.unit.id)).toEqual(['n', 'a', 'g', 'r']);
    expect(m.winnerIds).toEqual(['n']);
  });
  it('4-team mode: each player is a team', () => {
    const t4 = players.map((p) => ({ id: 't-' + p.id, name: p.name, avatar: av, playerIds: [p.id] }));
    let m = createMatch({ mode: 'teams4', scoringId: 'standard', players, teams: t4 });
    m = addRound(m, entries([[1, 1], [2, 2], [3, 3], [4, 4]]));
    expect(m.winnerIds).toEqual(['t-g']);
  });
});

describe('totals, winners, ties', () => {
  it('accumulates exactly across rounds', () => {
    let m = teamMatch();
    for (let i = 0; i < 10; i++) m = addRound(m, entries([[1, 2], [1, 2], [1, 2], [1, 2]]));
    // each player 1.1 * 10 = 11.0 exactly
    expect(computeTotals(m).player.n).toBe(11);
    expect(computeTotals(m).unit.tA).toBe(22);
  });
  it('no rounds -> no winner', () => {
    expect(computeWinnerIds(teamMatch())).toEqual([]);
  });
  it('ties share first place', () => {
    let m = teamMatch();
    m = addRound(m, entries([[3, 3], [3, 3], [3, 3], [3, 3]]));
    expect(computeWinnerIds(m).sort()).toEqual(['tA', 'tB']);
    expect(getStandings(m).map((s) => s.rank)).toEqual([1, 1]);
  });
  it('upTo limits rounds', () => {
    let m = teamMatch();
    m = addRound(m, entries([[3, 3], [3, 3], [3, 3], [3, 3]]));
    m = addRound(m, entries([[3, 3], [3, 3], [3, 3], [3, 3]]));
    expect(computeTotals(m, 1).unit.tA).toBe(6);
    expect(computeTotals(m).unit.tA).toBe(12);
  });
});

describe('round editing recalculates winner & totals', () => {
  it('editing an earlier round flips the winner', () => {
    let m = teamMatch();
    m = addRound(m, entries([[4, 4], [3, 3], [2, 2], [2, 2]])); // A 7, B 4
    m = addRound(m, entries([[2, 2], [2, 2], [3, 3], [3, 3]])); // A 4, B 6
    expect(m.winnerIds).toEqual(['tA']);
    expect(computeTotals(m).unit.tA).toBe(11);
    // Correct round 1: Nikhil actually failed his call
    m = updateRound(m, 1, entries([[4, 3], [3, 3], [2, 2], [2, 2]]));
    // round 1: Nikhil -4 + Amit 3 = -1 ; round 2: 4  => 3
    expect(computeTotals(m).unit.tA).toBe(3);
    expect(computeTotals(m).unit.tB).toBe(10);
    expect(m.winnerIds).toEqual(['tB']);
  });
  it('update of unknown round is a no-op', () => {
    const m = teamMatch();
    expect(updateRound(m, 5, entries([[1, 1], [1, 1], [1, 1], [1, 1]]))).toBe(m);
  });
  it('delete renumbers rounds', () => {
    let m = teamMatch();
    for (let i = 1; i <= 4; i++) m = addRound(m, entries([[i, i], [1, 1], [1, 1], [1, 1]]));
    m = deleteRound(m, 2);
    expect(m.rounds.map((r) => r.roundNumber)).toEqual([1, 2, 3]);
    expect(m.rounds[1].entries[0].call).toBe(3);
  });
  it('undo removes the last round', () => {
    let m = teamMatch();
    m = addRound(m, entries([[1, 1], [1, 1], [1, 1], [1, 1]]));
    m = addRound(m, entries([[2, 2], [2, 2], [2, 2], [2, 2]]));
    m = undoLastRound(m);
    expect(m.rounds).toHaveLength(1);
    expect(undoLastRound(undoLastRound(m)).rounds).toHaveLength(0);
  });
  it('does not mutate the input', () => {
    const m = teamMatch();
    const frozen = JSON.stringify(m);
    addRound(m, entries([[1, 1], [1, 1], [1, 1], [1, 1]]));
    expect(JSON.stringify(m)).toBe(frozen);
  });
  it('editing a completed match keeps it completed and recomputes the winner', () => {
    let m = teamMatch();
    m = addRound(m, entries([[4, 4], [3, 3], [2, 2], [2, 2]]));
    m = finishMatch(m);
    expect(m.winnerIds).toEqual(['tA']);
    m = updateRound(m, 1, entries([[4, 0], [3, 0], [2, 2], [2, 2]]));
    expect(m.status).toBe('completed');
    expect(m.winnerIds).toEqual(['tB']);
  });
  it('duplicate gets a new id and reopens', () => {
    let m = finishMatch(addRound(teamMatch(), entries([[1, 1], [1, 1], [1, 1], [1, 1]])));
    const d = duplicateMatchSetup(m);
    expect(d.id).not.toBe(m.id);
    expect(d.status).toBe('in_progress');
    expect(d.rounds).toHaveLength(1);
  });
});

describe('validation', () => {
  it('accepts valid entries', () => {
    expect(validateEntries(entries([[4, 4], [3, 3], [2, 2], [2, 2]]), players).ok).toBe(true);
  });
  it('rejects out of range, NaN, fractions', () => {
    expect(validateEntries(entries([[14, 4], [3, 3], [2, 2], [2, 2]]), players).ok).toBe(false);
    expect(validateEntries(entries([[4, NaN], [3, 3], [2, 2], [2, 2]]), players).ok).toBe(false);
    expect(validateEntries(entries([[4, 1.5], [3, 3], [2, 2], [2, 2]]), players).ok).toBe(false);
    expect(validateEntries(entries([[-1, 1], [3, 3], [2, 2], [2, 2]]), players).ok).toBe(false);
  });
  it('rejects more than 13 tricks in total, and not 13 when enforced', () => {
    expect(validateEntries(entries([[4, 6], [3, 6], [2, 2], [2, 2]]), players).ok).toBe(false);
    const short = entries([[4, 3], [3, 3], [2, 2], [2, 2]]);
    expect(validateEntries(short, players).ok).toBe(true);
    expect(validateEntries(short, players, { enforceThirteen: true }).ok).toBe(false);
  });
  it('rejects missing players', () => {
    expect(validateEntries(entries([[4, 4], [3, 3], [2, 2], [2, 2]]).slice(0, 3), players).ok).toBe(false);
  });
  it('validateSetup catches missing names, duplicates and unassigned players', () => {
    expect(validateSetup({ mode: 'teams2', scoringId: 'standard', players, teams }).ok).toBe(true);
    expect(validateSetup({ mode: 'individual', scoringId: 'standard', players: [{ ...players[0], name: ' ' }, ...players.slice(1)], teams: [] }).ok).toBe(false);
    expect(validateSetup({ mode: 'individual', scoringId: 'standard', players: [{ ...players[1], id: 'x' }, ...players.slice(1)], teams: [] }).ok).toBe(false);
    expect(validateSetup({ mode: 'teams2', scoringId: 'standard', players, teams: [teams[0], { ...teams[1], playerIds: ['r'] }] }).ok).toBe(false);
    expect(validateSetup({ mode: 'teams2', scoringId: 'standard', players, teams: [teams[0], { ...teams[1], name: 'team a' }] }).ok).toBe(false);
  });
});
