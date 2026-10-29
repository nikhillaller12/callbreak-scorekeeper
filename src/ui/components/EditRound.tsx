import { useEffect, useState } from 'react';
import { deleteRound, updateRound, validateEntries } from '../../domain/match';
import type { Match, RoundEntry } from '../../domain/types';
import { actions, toast } from '../../state/store';
import { confirmDialog, Sheet } from './common';
import { RoundForm } from './RoundForm';

export function entriesFrom(match: Match, calls: number[], tricks: number[]): RoundEntry[] {
  return match.players.map((p, i) => ({ playerId: p.id, call: calls[i], tricks: tricks[i] }));
}

/** Edit any earlier round. Totals, winner and stats are derived, so they update automatically. */
export function EditRoundSheet({ match, roundNumber, onClose }: { match: Match; roundNumber: number; onClose: () => void }) {
  const round = match.rounds.find((r) => r.roundNumber === roundNumber);
  const [calls, setCalls] = useState(() => match.players.map((p) => round?.entries.find((e) => e.playerId === p.id)?.call ?? 1));
  const [tricks, setTricks] = useState(() => match.players.map((p) => round?.entries.find((e) => e.playerId === p.id)?.tricks ?? 0));
  const [errors, setErrors] = useState<string[]>([]);
  if (!round) return null;

  const save = () => {
    const entries = entriesFrom(match, calls, tricks);
    const v = validateEntries(entries, match.players, { enforceThirteen: false });
    if (!v.ok) { setErrors(v.errors); return; }
    void actions.saveMatch(updateRound(match, roundNumber, entries));
    toast(`Round ${roundNumber} updated – totals recalculated`, 'success');
    onClose();
  };
  const remove = async () => {
    if (await confirmDialog({ title: `Delete round ${roundNumber}?`, message: 'Later rounds will move up by one and all totals will be recalculated.', confirmLabel: 'Delete round', danger: true })) {
      void actions.saveMatch(deleteRound(match, roundNumber));
      toast(`Round ${roundNumber} deleted`);
      onClose();
    }
  };

  return (
    <Sheet
      title={`Edit round ${roundNumber}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn danger" onClick={() => void remove()}>🗑 Delete</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={save}>Save changes</button>
        </>
      }
    >
      <div className="stack">
        <RoundForm
          match={match}
          calls={calls}
          tricks={tricks}
          mode="both"
          onCall={(i, n) => { setCalls((c) => c.map((v, k) => (k === i ? n : v))); setErrors([]); }}
          onTricks={(i, n) => { setTricks((t) => t.map((v, k) => (k === i ? n : v))); setErrors([]); }}
        />
        {errors.length > 0 && (
          <div className="banner" role="alert"><span aria-hidden="true">⚠️</span><ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>
        )}
      </div>
    </Sheet>
  );
}

const PIECES = ['♠', '♥', '♦', '♣', '🃏', '✨', '🏆'];

export function Confetti({ count = 26, onDone }: { count?: number; onDone?: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            animationDelay: `${(i % 9) * 0.12}s`,
            animationDuration: `${2 + (i % 5) * 0.35}s`,
            color: i % 3 === 0 ? '#e8c766' : i % 3 === 1 ? '#e0574b' : '#f6efd8',
          }}
        >
          {PIECES[i % PIECES.length]}
        </span>
      ))}
    </div>
  );
}

export function Burst({ onDone }: { onDone?: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 1100);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="burst" aria-hidden="true">
      {['♠', '♥', '♦', '♣', '✨', '⭐', '♠', '♥'].map((s, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <span key={i} style={{ ['--dx' as string]: `${Math.cos(a) * 90}px`, ['--dy' as string]: `${Math.sin(a) * 90}px`, color: i % 2 ? '#e8c766' : '#f6efd8' }}>{s}</span>;
      })}
    </div>
  );
}
