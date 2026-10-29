import { useState } from 'react';
import { duplicateMatchSetup } from '../../domain/match';
import type { Match } from '../../domain/types';
import { cleanText } from '../../domain/util';
import { actions, toast } from '../../state/store';
import { go } from '../router';
import { confirmDialog, Field, Sheet } from './common';
import { ShareSheet } from './ShareSheet';

export async function deleteMatchWithConfirm(match: Match): Promise<boolean> {
  const ok = await confirmDialog({
    title: 'Delete this match?',
    message: `“${match.name}” and all of its rounds will be removed from this device. This cannot be undone (export a backup first if unsure).`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (ok) {
    await actions.deleteMatch(match.id);
    toast('Match deleted');
  }
  return ok;
}

export function duplicateMatch(match: Match) {
  const copy = duplicateMatchSetup(match);
  void actions.saveMatch(copy);
  toast('Match duplicated – you can continue it', 'success');
  return copy;
}

export function RenameSheet({ match, onClose }: { match: Match; onClose: () => void }) {
  const [name, setName] = useState(match.name);
  const clean = cleanText(name, 60);
  const save = () => {
    if (!clean) return;
    void actions.saveMatch({ ...match, name: clean, updatedAt: Date.now() });
    toast('Match renamed', 'success');
    onClose();
  };
  return (
    <Sheet
      title="Rename match"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!clean} onClick={save}>Save</button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Match name" error={clean ? undefined : 'Please enter a name'}>
          {(id) => <input id={id} type="text" data-autofocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}
        </Field>
      </form>
    </Sheet>
  );
}

/** "⋯" menu with every match action. */
export function MatchMenuButton({ match, onDeleted }: { match: Match; onDeleted?: () => void }) {
  const [open, setOpen] = useState(false);
  const [rename, setRename] = useState(false);
  const [share, setShare] = useState(false);
  return (
    <>
      <button type="button" className="icon-btn" aria-label={`Actions for ${match.name}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>⋯</button>
      {open && (
        <Sheet title={match.name} onClose={() => setOpen(false)}>
          <div className="menu-list">
            <button type="button" className="btn" onClick={() => { setOpen(false); go(match.status === 'in_progress' ? `/play/${match.id}` : `/match/${match.id}`); }}>
              {match.status === 'in_progress' ? '▶ Continue match' : '📖 Open scorecard'}
            </button>
            <button type="button" className="btn" onClick={() => { setOpen(false); setShare(true); }}>📤 Share / export</button>
            <button type="button" className="btn" onClick={() => { setOpen(false); setRename(true); }}>✏️ Rename</button>
            <button type="button" className="btn" onClick={() => { setOpen(false); const c = duplicateMatch(match); go(`/play/${c.id}`); }}>⧉ Duplicate</button>
            <button type="button" className="btn danger" onClick={async () => { setOpen(false); if (await deleteMatchWithConfirm(match)) onDeleted?.(); }}>🗑 Delete</button>
          </div>
        </Sheet>
      )}
      {rename && <RenameSheet match={match} onClose={() => setRename(false)} />}
      {share && <ShareSheet match={match} onClose={() => setShare(false)} />}
    </>
  );
}
