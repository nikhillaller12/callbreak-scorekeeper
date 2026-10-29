import { useRef, useState } from 'react';
import { play } from '../../audio/audio';
import { parseBackup, type SanitizeReport } from '../../domain/sanitize';
import { SCORING_RULES } from '../../domain/scoring';
import type { GameMode, ScoringId } from '../../domain/types';
import { backupJson, downloadText } from '../../share/exporters';
import { actions, toast, useStore } from '../../state/store';
import { confirmDialog, Field, Segmented, Sheet, Toggle } from '../components/common';
import { Screen } from '../components/Screen';
import { go } from '../router';

export function SettingsScreen() {
  const { data, storageKind } = useStore();
  const s = data.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<SanitizeReport | null>(null);
  const hasDemo = data.matches.some((m) => m.demo) || data.players.some((p) => p.demo) || data.teams.some((t) => t.demo);

  const set = (patch: Parameters<typeof actions.updateSettings>[0]) => void actions.updateSettings(patch);

  const exportAll = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(backupJson(data), `callbreak-backup-${stamp}.json`, 'application/json');
    toast('Backup downloaded', 'success');
  };

  const onFile = async (f?: File | null) => {
    if (!f) return;
    if (f.size > 50 * 1024 * 1024) { toast('That file is too large to be a backup.', 'error'); return; }
    const text = await f.text();
    const res = parseBackup(text);
    if (!res.ok) { toast(res.error, 'error'); return; }
    setPending(res.report);
  };

  const doMerge = async () => {
    if (!pending) return;
    const r = await actions.mergeIn(pending.data);
    toast(`Merged: ${r.added} added, ${r.updated} updated. Nothing was deleted.`, 'success');
    setPending(null);
  };
  const doReplace = async () => {
    if (!pending) return;
    const ok = await confirmDialog({
      title: 'Replace all data?',
      message: 'Everything currently on this device will be replaced by the backup. Download a backup of your current data first if you are not sure.',
      confirmLabel: 'Replace everything',
      danger: true,
    });
    if (!ok) return;
    await actions.replaceAll({ ...pending.data, settings: s });
    toast('Backup restored', 'success');
    setPending(null);
  };

  const clearAll = async () => {
    const ok = await confirmDialog({
      title: 'Delete ALL data?',
      message: 'All players, teams and matches on this device will be permanently deleted. Export a backup first if you might want them back.',
      confirmLabel: 'Delete everything',
      danger: true,
    });
    if (!ok) return;
    const really = await confirmDialog({ title: 'Are you absolutely sure?', message: 'This cannot be undone.', confirmLabel: 'Yes, delete all', danger: true });
    if (!really) return;
    await actions.clearAll();
    toast('All data deleted');
  };

  return (
    <Screen title="Settings">
      <div className="stack">
        <section className="card" aria-label="Sound">
          <h2 className="section-title">Sound</h2>
          <Toggle label="🔊 Sound effects" hint="Short tones for rounds, calls and winners" checked={s.soundEffects} onChange={(v) => { set({ soundEffects: v }); if (v && !s.muted) setTimeout(() => play('tap'), 50); }} />
          <Toggle label="🎵 Game music" hint="Soft background loop (starts after you tap)" checked={s.music} onChange={(v) => set({ music: v })} />
          <Toggle label="🔇 Mute everything" hint="Quick switch, also in the top bar" checked={s.muted} onChange={(v) => set({ muted: v })} />
        </section>

        <section className="card stack-sm" aria-label="Appearance and defaults">
          <h2 className="section-title">Appearance & defaults</h2>
          <Field label="Theme">
            {() => (
              <Segmented<'dark' | 'light'>
                label="Theme"
                value={s.theme}
                onChange={(v) => set({ theme: v })}
                options={[{ value: 'dark', label: '🌙 Casino green' }, { value: 'light', label: '☀️ Light' }]}
              />
            )}
          </Field>
          <Field label="Default game mode">
            {(id) => (
              <select id={id} value={s.defaultMode} onChange={(e) => set({ defaultMode: e.target.value as GameMode })}>
                <option value="individual">Individual</option>
                <option value="teams2">2 Teams</option>
                <option value="teams4">4 Teams</option>
              </select>
            )}
          </Field>
          <Field label="Default scoring system" hint={SCORING_RULES[s.defaultScoring].description}>
            {(id) => (
              <select id={id} value={s.defaultScoring} onChange={(e) => set({ defaultScoring: e.target.value as ScoringId })}>
                {Object.values(SCORING_RULES).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
          </Field>
          <Toggle label="Require 13 tricks per round" hint="When on, a round can only be saved if tricks add up to exactly 13" checked={s.enforceThirteen} onChange={(v) => set({ enforceThirteen: v })} />
        </section>

        <section className="card stack-sm" aria-label="Manage">
          <h2 className="section-title">Manage</h2>
          <div className="btn-row">
            <a className="btn" style={{ flex: '1 1 150px' }} href="#/players">👤 Players</a>
            <a className="btn" style={{ flex: '1 1 150px' }} href="#/players" onClick={() => setTimeout(() => (document.querySelectorAll('[role=tab]')[1] as HTMLElement | undefined)?.click(), 50)}>👥 Teams</a>
          </div>
        </section>

        <section className="card stack-sm" aria-label="Backup and restore">
          <h2 className="section-title">Backup & restore</h2>
          <p className="muted-text">
            Your data lives only on this device ({storageKind === 'indexeddb' ? 'browser storage' : 'memory – will be lost on close'}). Export a backup now and then, especially before clearing browser data.
          </p>
          <div className="btn-row">
            <button type="button" className="btn primary" style={{ flex: '1 1 150px' }} onClick={exportAll}>⬇ Export all data</button>
            <button type="button" className="btn" style={{ flex: '1 1 150px' }} onClick={() => fileRef.current?.click()}>⬆ Import data</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden aria-label="Choose backup file" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="hint">{data.matches.length} matches · {data.players.length} players · {data.teams.length} teams</div>
        </section>

        <section className="card stack-sm" aria-label="Demo data">
          <h2 className="section-title">Demo data</h2>
          <p className="muted-text">Sample players (Nikhil, Amit, Rahul, Gaurav) and matches to explore the app.</p>
          <div className="btn-row">
            <button type="button" className="btn" style={{ flex: '1 1 150px' }} onClick={async () => { await actions.loadDemo(); toast('Demo data added', 'success'); }}>Add demo data</button>
            <button type="button" className="btn" style={{ flex: '1 1 150px' }} disabled={!hasDemo} onClick={async () => {
              if (await confirmDialog({ title: 'Remove demo data?', message: 'Only the sample players, teams and matches are removed. Your own data is kept.', confirmLabel: 'Remove demo data' })) {
                await actions.removeDemo();
                toast('Demo data removed');
              }
            }}>Remove demo data</button>
          </div>
        </section>

        <section className="card stack-sm" aria-label="Danger zone" style={{ borderColor: 'var(--danger)' }}>
          <h2 className="section-title" style={{ color: 'var(--danger)' }}>Danger zone</h2>
          <button type="button" className="btn danger block" onClick={() => void clearAll()}>🗑 Clear all data</button>
        </section>

        <section className="card stack-sm" aria-label="About">
          <h2 className="section-title">About</h2>
          <p className="muted-text">Call Break Scorekeeper – offline, no account, no ads. Made for physical card games. ♠ ♥ ♦ ♣</p>
          <button type="button" className="btn small" onClick={() => go('/')}>← Home</button>
        </section>
      </div>

      {pending && (
        <Sheet title="Import backup" onClose={() => setPending(null)}>
          <div className="stack">
            <p>This backup contains <b>{pending.data.matches.length}</b> matches, <b>{pending.data.players.length}</b> players and <b>{pending.data.teams.length}</b> teams.</p>
            {pending.droppedMatches + pending.droppedPlayers + pending.droppedTeams > 0 && (
              <div className="banner" role="alert">
                <span aria-hidden="true">⚠️</span>
                <span>{pending.droppedMatches + pending.droppedPlayers + pending.droppedTeams} damaged record(s) in the file were skipped. Everything valid will be imported.</span>
              </div>
            )}
            <div className="menu-list">
              <button type="button" className="btn primary" onClick={() => void doMerge()}>➕ Merge with my data (safe)</button>
              <p className="hint">Adds new records and updates ones that are older here. Nothing is deleted.</p>
              <button type="button" className="btn danger" onClick={() => void doReplace()}>♻ Replace everything</button>
              <p className="hint">Deletes current data and uses only the backup.</p>
            </div>
          </div>
        </Sheet>
      )}
    </Screen>
  );
}
