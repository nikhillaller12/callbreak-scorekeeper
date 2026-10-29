import { useState } from 'react';
import { play } from '../../audio/audio';
import { addRound, computeTotals, finishMatch, getUnits, isTeamMatch, scoreRound, undoLastRound, validateEntries } from '../../domain/match';
import { isCallMade } from '../../domain/scoring';
import type { Match, RoundDraft } from '../../domain/types';
import { fmt } from '../../domain/util';
import { actions, getState, toast, useStore } from '../../state/store';
import { Burst, EditRoundSheet, entriesFrom } from '../components/EditRound';
import { MatchMenuButton } from '../components/MatchActions';
import { Scoreboard } from '../components/Scoreboard';
import { Screen } from '../components/Screen';
import { Avatar, confirmDialog, Empty, Sheet } from '../components/common';
import { RoundForm } from '../components/RoundForm';
import { go } from '../router';

const DEFAULT_DRAFT: RoundDraft = { calls: [1, 1, 1, 1], tricks: [0, 0, 0, 0], step: 'calls' };

export function PlayScreen({ matchId }: { matchId: string }) {
  const { data, ready } = useStore();
  const match = data.matches.find((m) => m.id === matchId);
  const [errors, setErrors] = useState<string[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [burst, setBurst] = useState(0);

  if (!ready) return <Screen><div className="loading" aria-label="Loading">♠</div></Screen>;
  if (!match) {
    return (
      <Screen title="Match" back="/">
        <Empty icon="🔍" title="Match not found">It may have been deleted. <a href="#/history">Go to history</a></Empty>
      </Screen>
    );
  }
  if (match.status === 'completed') {
    go(`/match/${match.id}`, true);
    return null;
  }

  const draft = match.draft ?? DEFAULT_DRAFT;
  const teamed = isTeamMatch(match);
  const roundNo = match.rounds.length + 1;
  const save = (m: Match) => void actions.saveMatch(m);
  /** Always merges into the latest stored draft, so rapid consecutive taps never overwrite each other. */
  const updateDraft = (fn: (d: RoundDraft) => RoundDraft) => {
    const latest = getState().data.matches.find((m) => m.id === matchId);
    if (!latest || latest.status !== 'in_progress') return;
    setErrors([]);
    save({ ...latest, draft: fn(latest.draft ?? DEFAULT_DRAFT) });
  };

  const goTricks = () => {
    setJustSaved(false);
    play('tap');
    updateDraft((d) => ({ ...d, step: 'tricks' }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveRound = () => {
    const entries = entriesFrom(match, draft.calls, draft.tricks);
    const v = validateEntries(entries, match.players, { enforceThirteen: data.settings.enforceThirteen });
    if (!v.ok) { setErrors(v.errors); return; }
    const next = addRound(match, entries);
    save(next);
    setErrors([]);
    setJustSaved(true);
    const anyMade = entries.some((e) => isCallMade(e.call, e.tricks));
    const anyFail = entries.some((e) => !isCallMade(e.call, e.tricks));
    if (anyMade) { setBurst((b) => b + 1); play('success'); } else if (anyFail) play('fail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const undo = async () => {
    const last = match.rounds[match.rounds.length - 1];
    if (!last) return;
    const prev = undoLastRound(match);
    // Keep the removed round's numbers so the user can correct them instead of retyping.
    save({
      ...prev,
      draft: {
        calls: match.players.map((p) => last.entries.find((e) => e.playerId === p.id)?.call ?? 1),
        tricks: match.players.map((p) => last.entries.find((e) => e.playerId === p.id)?.tricks ?? 0),
        step: 'tricks',
      },
    });
    setJustSaved(false);
    toast(`Round ${last.roundNumber} reopened for correction`);
  };

  const finish = async () => {
    if (match.rounds.length === 0) {
      if (await confirmDialog({ title: 'No rounds played', message: 'Nothing has been scored yet. Discard this match?', confirmLabel: 'Discard match', danger: true })) {
        await actions.deleteMatch(match.id);
        go('/', true);
      }
      return;
    }
    const pending = draft.step === 'tricks' || draft.calls.some((c, i) => c !== 1 || draft.tricks[i] !== 0);
    const ok = await confirmDialog({
      title: 'Finish this match?',
      message: pending
        ? `The unsaved entries for round ${roundNo} will be discarded. The final result will be saved to history. You can still edit rounds afterwards.`
        : 'The final result will be saved to history. You can still edit rounds afterwards.',
      confirmLabel: 'Finish match',
    });
    if (!ok) return;
    save(finishMatch(match));
    play('complete');
    go(`/match/${match.id}?finished=1`, true);
  };

  const lastRound = match.rounds[match.rounds.length - 1];
  const lastScores = lastRound ? scoreRound(match, lastRound) : null;
  const units = getUnits(match);
  const totals = computeTotals(match);
  void totals;

  return (
    <Screen title={match.name} back="/" bare actions={<MatchMenuButton match={match} onDeleted={() => go('/', true)} />}>
      {burst > 0 && <Burst key={burst} />}
      <div className="stack">
        <Scoreboard match={match} live />

        {justSaved && lastRound && lastScores && (
          <section className="card result-panel" aria-label={`Round ${lastRound.roundNumber} result`}>
            <div className="row" style={{ marginBottom: 6 }}>
              <h2 style={{ fontSize: '1.05rem', flex: 1 }}>Round {lastRound.roundNumber} result</h2>
              <button type="button" className="icon-btn" aria-label="Dismiss result" onClick={() => setJustSaved(false)}>✕</button>
            </div>
            {lastRound.entries.map((e) => {
              const p = match.players.find((x) => x.id === e.playerId)!;
              const made = isCallMade(e.call, e.tricks);
              return (
                <div className="result-line" key={e.playerId}>
                  <Avatar avatar={p.avatar} name={p.name} size={28} />
                  <span className="nm">{p.name} <span className="hint">called {e.call}, won {e.tricks}</span></span>
                  <span className={'badge ' + (made ? 'good' : 'bad')}>{made ? '✓ Made' : '✗ Failed'}</span>
                  <b className="num" style={{ minWidth: 52, textAlign: 'right' }}>{fmt(lastScores.player[e.playerId])}</b>
                </div>
              );
            })}
            {teamed && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                {units.map((u) => (
                  <div className="result-line" key={u.id}>
                    <Avatar avatar={u.avatar} name={u.name} size={24} />
                    <span className="nm"><b>{u.name}</b></span>
                    <b className="num">{fmt(lastScores.unit[u.id])}</b>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="stack-sm" aria-label={`Round ${roundNo} entry`}>
          <div className="row">
            <h2 style={{ fontSize: '1.25rem', flex: 1 }}>
              Round {roundNo}{roundNo <= 13 && <span className="muted-text"> / 13</span>}
            </h2>
            {match.rounds.length > 0 && (
              <button type="button" className="btn small" onClick={() => void undo()} aria-label="Undo last round and correct it">↶ Undo last</button>
            )}
          </div>
          <div className="steps" aria-label="Round steps">
            <div className={'step-pill' + (draft.step === 'calls' ? ' on' : '')} aria-current={draft.step === 'calls' ? 'step' : undefined}>1 · Calls</div>
            <div className={'step-pill' + (draft.step === 'tricks' ? ' on' : '')} aria-current={draft.step === 'tricks' ? 'step' : undefined}>2 · Tricks won</div>
          </div>
          <RoundForm
            key={`${roundNo}-${draft.step}`}
            match={match}
            calls={draft.calls}
            tricks={draft.tricks}
            mode={draft.step}
            onCall={(i, n) => updateDraft((d) => ({ ...d, calls: d.calls.map((v, k) => (k === i ? n : v)) }))}
            onTricks={(i, n) => updateDraft((d) => ({ ...d, tricks: d.tricks.map((v, k) => (k === i ? n : v)) }))}
          />
          {errors.length > 0 && (
            <div className="banner" role="alert"><span aria-hidden="true">⚠️</span><ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>
          )}
        </section>

        {match.rounds.length > 0 && (
          <section className="stack-sm" aria-label="Rounds so far">
            <div className="row">
              <h2 className="section-title" style={{ flex: 1, margin: 0 }}>Rounds so far</h2>
              <button type="button" className="btn small ghost" onClick={() => setShowTable(true)}>Full scorecard</button>
            </div>
            <RoundsTable match={match} onEdit={setEditing} compact />
          </section>
        )}

        <button type="button" className="btn block" onClick={() => void finish()}>🏁 Finish match</button>
      </div>

      <div className="play-bar">
        <div className="play-bar-inner">
          {draft.step === 'calls' ? (
            <button key="to-tricks" type="button" className="btn primary" onClick={goTricks}>Calls set → Enter tricks</button>
          ) : (
            <>
              <button key="to-calls" type="button" className="btn" onClick={() => updateDraft((d) => ({ ...d, step: 'calls' }))} aria-label="Back to calls">← Calls</button>
              <button key="save-round" type="button" className="btn primary" onClick={saveRound}>✓ Save round {roundNo}</button>
            </>
          )}
        </div>
      </div>

      {editing !== null && <EditRoundSheet match={match} roundNumber={editing} onClose={() => setEditing(null)} />}
      {showTable && (
        <Sheet title="Scorecard" onClose={() => setShowTable(false)} wide>
          <RoundsTable match={match} onEdit={(n) => { setShowTable(false); setEditing(n); }} />
        </Sheet>
      )}
    </Screen>
  );
}

/** Round-by-round scorecard (players + team totals). Tap a row's ✏️ to correct it. */
export function RoundsTable({ match, onEdit, compact }: { match: Match; onEdit?: (round: number) => void; compact?: boolean }) {
  const teamed = isTeamMatch(match);
  const units = getUnits(match);
  const totals = computeTotals(match);
  const rows = match.rounds.map((r) => ({ r, s: scoreRound(match, r) }));
  const shown = compact ? rows.slice(-3) : rows;
  const winners = new Set(match.winnerIds ?? []);
  return (
    <div className="table-wrap">
      <table className="sheet-table">
        <caption className="sr-only">Scores by round</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            {match.players.map((p) => <th scope="col" key={p.id}>{p.name}</th>)}
            {teamed && units.map((u) => <th scope="col" key={u.id}>{u.name}</th>)}
            {onEdit && <th scope="col" className="edit-cell"><span className="sr-only">Edit</span></th>}
          </tr>
        </thead>
        <tbody>
          {shown.map(({ r, s }) => (
            <tr key={r.roundNumber}>
              <td>{r.roundNumber}</td>
              {match.players.map((p) => {
                const e = r.entries.find((x) => x.playerId === p.id)!;
                const v = s.player[p.id];
                return (
                  <td key={p.id} className={v < 0 ? 'neg' : ''}>
                    <b>{fmt(v)}</b>
                    <small>{e.call}→{e.tricks}</small>
                  </td>
                );
              })}
              {teamed && units.map((u) => <td key={u.id} className={s.unit[u.id] < 0 ? 'neg' : ''}><b>{fmt(s.unit[u.id])}</b></td>)}
              {onEdit && (
                <td className="edit-cell">
                  <button type="button" className="edit-btn" aria-label={`Edit round ${r.roundNumber}`} onClick={() => onEdit(r.roundNumber)}>✏️</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        {!compact && (
          <tfoot>
            <tr>
              <td>Total</td>
              {match.players.map((p) => <td key={p.id}>{fmt(totals.player[p.id] ?? 0)}</td>)}
              {teamed && units.map((u) => <td key={u.id} className={winners.has(u.id) ? 'scorecard-total-win' : ''}>{fmt(totals.unit[u.id] ?? 0)}</td>)}
              {onEdit && <td />}
            </tr>
          </tfoot>
        )}
      </table>
      {compact && match.rounds.length > 3 && <div className="hint" style={{ padding: 8, textAlign: 'center' }}>Showing last 3 of {match.rounds.length} rounds</div>}
    </div>
  );
}
