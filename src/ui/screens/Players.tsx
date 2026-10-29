import { useMemo, useState } from 'react';
import { computePlayerStats, computeTeamStats } from '../../domain/stats';
import type { Avatar as AvatarT, Player, Team } from '../../domain/types';
import { cleanText, fmt, uid } from '../../domain/util';
import { actions, toast, useStore } from '../../state/store';
import { defaultAvatar } from '../avatars';
import { Avatar, AvatarEditor, AvatarStack, confirmDialog, Empty, Field, Sheet } from '../components/common';
import { Screen } from '../components/Screen';

/* ---------- editors ---------- */

export function PlayerEditor({ player, onClose, onSaved }: { player?: Player; onClose: () => void; onSaved?: (p: Player) => void }) {
  const { data } = useStore();
  const [name, setName] = useState(player?.name ?? '');
  const [nickname, setNickname] = useState(player?.nickname ?? '');
  const [avatar, setAvatar] = useState<AvatarT | null>(player?.avatar ?? null);
  const shownAvatar = avatar ?? defaultAvatar(name);
  const clean = cleanText(name, 30);
  const dup = data.players.some((p) => p.id !== player?.id && p.name.trim().toLowerCase() === clean.toLowerCase());
  const error = !clean ? 'Please enter a name' : dup ? 'A player with this name already exists' : undefined;

  const save = () => {
    if (error) return;
    const now = Date.now();
    const p: Player = {
      id: player?.id ?? uid(),
      name: clean,
      nickname: cleanText(nickname, 20) || undefined,
      avatar: shownAvatar,
      createdAt: player?.createdAt ?? now,
      updatedAt: now,
      demo: player?.demo,
    };
    void actions.savePlayer(p);
    toast(player ? 'Player updated' : 'Player added', 'success');
    onSaved?.(p);
    onClose();
  };
  return (
    <Sheet
      title={player ? 'Edit player' : 'New player'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!!error} onClick={save}>Save</button>
        </>
      }
    >
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Name" error={name && error ? error : undefined}>
          {(id) => <input id={id} type="text" data-autofocus value={name} maxLength={30} autoComplete="off" placeholder="e.g. Nikhil" onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Nickname (optional)">
          {(id) => <input id={id} type="text" value={nickname} maxLength={20} autoComplete="off" onChange={(e) => setNickname(e.target.value)} />}
        </Field>
        <AvatarEditor value={shownAvatar} name={name} onChange={setAvatar} />
      </form>
    </Sheet>
  );
}

export function TeamEditor({ team, onClose }: { team?: Team; onClose: () => void }) {
  const { data } = useStore();
  const [name, setName] = useState(team?.name ?? '');
  const [avatar, setAvatar] = useState<AvatarT>(team?.avatar ?? { color: '#1e8449', emoji: '♠' });
  const [ids, setIds] = useState<string[]>(team?.playerIds ?? []);
  const clean = cleanText(name, 30);
  const dup = data.teams.some((t) => t.id !== team?.id && t.name.trim().toLowerCase() === clean.toLowerCase());
  const error = !clean ? 'Please enter a team name' : dup ? 'A team with this name already exists' : ids.length === 0 ? 'Pick at least one player' : undefined;
  const save = () => {
    if (error) return;
    const now = Date.now();
    void actions.saveTeam({ id: team?.id ?? uid(), name: clean, avatar, playerIds: ids, createdAt: team?.createdAt ?? now, updatedAt: now, demo: team?.demo });
    toast(team ? 'Team updated' : 'Team added', 'success');
    onClose();
  };
  return (
    <Sheet
      title={team ? 'Edit team' : 'New team'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!!error} onClick={save}>Save</button>
        </>
      }
    >
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Team name" error={name && error && !ids.length ? undefined : name ? error : undefined}>
          {(id) => <input id={id} type="text" data-autofocus value={name} maxLength={30} autoComplete="off" placeholder="e.g. Team A" onChange={(e) => setName(e.target.value)} />}
        </Field>
        <AvatarEditor value={avatar} name={name} onChange={setAvatar} />
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>Players</legend>
          {data.players.length === 0 ? (
            <p className="muted-text">Add players first (Players tab).</p>
          ) : (
            <div className="chip-row">
              {data.players.map((p) => {
                const on = ids.includes(p.id);
                return (
                  <button key={p.id} type="button" className="chip" aria-pressed={on} onClick={() => setIds(on ? ids.filter((x) => x !== p.id) : [...ids, p.id])}>
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
          {ids.length === 0 && <div className="hint" style={{ marginTop: 6 }}>Pick at least one player.</div>}
        </fieldset>
      </form>
    </Sheet>
  );
}

/* ---------- screen ---------- */

export function PlayersScreen() {
  const { data } = useStore();
  const [tab, setTab] = useState<'players' | 'teams'>('players');
  const [editingPlayer, setEditingPlayer] = useState<Player | 'new' | null>(null);
  const [editingTeam, setEditingTeam] = useState<Team | 'new' | null>(null);
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);
  const [viewTeam, setViewTeam] = useState<Team | null>(null);

  const pStats = useMemo(() => new Map(computePlayerStats(data.matches).map((s) => [s.playerId, s])), [data.matches]);
  const tStats = useMemo(() => computeTeamStats(data.matches), [data.matches]);
  const teamStat = (t: Team) => tStats.find((s) => s.key === t.id) ?? tStats.find((s) => s.name.toLowerCase() === t.name.toLowerCase());

  const players = [...data.players].sort((a, b) => a.name.localeCompare(b.name));
  const teams = [...data.teams].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Screen title="Players & Teams">
      <div className="stack">
        <div className="tabs" role="tablist" aria-label="Players or teams">
          <button type="button" role="tab" aria-selected={tab === 'players'} onClick={() => setTab('players')}>👤 Players ({players.length})</button>
          <button type="button" role="tab" aria-selected={tab === 'teams'} onClick={() => setTab('teams')}>👥 Teams ({teams.length})</button>
        </div>

        {tab === 'players' ? (
          <>
            <button type="button" className="btn primary block" onClick={() => setEditingPlayer('new')}>＋ Add player</button>
            {players.length === 0 && <Empty icon="👤" title="No players yet">Add the people you play with. You can also add players while setting up a match.</Empty>}
            <div className="stack-sm">
              {players.map((p) => {
                const s = pStats.get(p.id);
                return (
                  <button key={p.id} type="button" className="person" onClick={() => setViewPlayer(p)} aria-label={`${p.name}, open profile`}>
                    <Avatar avatar={p.avatar} name={p.name} size={52} ring />
                    <span className="nm">{p.name}{p.nickname && <small>“{p.nickname}”</small>}</span>
                    <span className="right">{s ? `${s.matchesWon}W · ${s.matchesLost}L` : '–'}<small>{s ? `${s.matchesPlayed} played` : 'no matches'}</small></span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <button type="button" className="btn primary block" onClick={() => setEditingTeam('new')}>＋ Add team</button>
            {teams.length === 0 && <Empty icon="👥" title="No saved teams yet">Save a team once and reuse it in future matches. Teams are also saved automatically when you start a match.</Empty>}
            <div className="stack-sm">
              {teams.map((t) => {
                const s = teamStat(t);
                const members = t.playerIds.map((id) => data.players.find((p) => p.id === id)).filter((p): p is Player => !!p);
                return (
                  <button key={t.id} type="button" className="person" onClick={() => setViewTeam(t)} aria-label={`${t.name}, open profile`}>
                    <Avatar avatar={t.avatar} name={t.name} size={52} ring />
                    <span className="nm">{t.name}<small>{members.map((m) => m.name).join(' + ') || 'No players'}</small></span>
                    <span className="right">{s ? `${s.wins}W · ${s.losses}L` : '–'}<small>{s ? `${s.winRate}% wins` : 'no matches'}</small></span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {editingPlayer && <PlayerEditor player={editingPlayer === 'new' ? undefined : editingPlayer} onClose={() => setEditingPlayer(null)} />}
      {editingTeam && <TeamEditor team={editingTeam === 'new' ? undefined : editingTeam} onClose={() => setEditingTeam(null)} />}

      {viewPlayer && (() => {
        const p = data.players.find((x) => x.id === viewPlayer.id);
        if (!p) return null;
        const s = pStats.get(p.id);
        return (
          <Sheet title="Player profile" onClose={() => setViewPlayer(null)} footer={
            <>
              <button type="button" className="btn danger" onClick={async () => {
                if (await confirmDialog({ title: `Delete ${p.name}?`, message: 'The player profile is removed. Finished matches keep their scores and names, but this player’s lifetime stats will no longer be grouped under a profile.', confirmLabel: 'Delete', danger: true })) {
                  await actions.deletePlayer(p.id);
                  toast('Player deleted');
                  setViewPlayer(null);
                }
              }}>🗑 Delete</button>
              <button type="button" className="btn primary" onClick={() => { setViewPlayer(null); setEditingPlayer(p); }}>✏️ Edit</button>
            </>
          }>
            <div className="stack">
              <div className="row" style={{ gap: 14 }}>
                <Avatar avatar={p.avatar} name={p.name} size={76} ring />
                <div><h3>{p.name}</h3>{p.nickname && <div className="muted-text">“{p.nickname}”</div>}</div>
              </div>
              {s ? (
                <div className="stat-tiles">
                  <Tile k="Matches played" v={s.matchesPlayed} />
                  <Tile k="Won / Lost" v={`${s.matchesWon} / ${s.matchesLost}`} s={`${s.winRate}% win rate`} />
                  <Tile k="Total score" v={fmt(s.totalScore)} />
                  <Tile k="Average / match" v={fmt(s.averageScore)} />
                  <Tile k="Total tricks" v={s.totalTricks} />
                  <Tile k="Total calls" v={s.totalCalls} />
                  <Tile k="Successful calls" v={s.successfulCalls} />
                  <Tile k="Call success" v={`${s.callSuccessRate}%`} />
                </div>
              ) : (
                <p className="muted-text">No finished matches yet. Stats appear after a match is completed.</p>
              )}
            </div>
          </Sheet>
        );
      })()}

      {viewTeam && (() => {
        const t = data.teams.find((x) => x.id === viewTeam.id);
        if (!t) return null;
        const s = teamStat(t);
        const members = t.playerIds.map((id) => data.players.find((p) => p.id === id)).filter((p): p is Player => !!p);
        return (
          <Sheet title="Team profile" onClose={() => setViewTeam(null)} footer={
            <>
              <button type="button" className="btn danger" onClick={async () => {
                if (await confirmDialog({ title: `Delete ${t.name}?`, message: 'The saved team is removed. Past matches are not affected.', confirmLabel: 'Delete', danger: true })) {
                  await actions.deleteTeam(t.id);
                  toast('Team deleted');
                  setViewTeam(null);
                }
              }}>🗑 Delete</button>
              <button type="button" className="btn primary" onClick={() => { setViewTeam(null); setEditingTeam(t); }}>✏️ Edit</button>
            </>
          }>
            <div className="stack">
              <div className="row" style={{ gap: 14 }}>
                <Avatar avatar={t.avatar} name={t.name} size={76} ring />
                <div><h3>{t.name}</h3><AvatarStack items={members.map((m) => ({ avatar: m.avatar, name: m.name }))} /> <div className="muted-text">{members.map((m) => m.name).join(' + ')}</div></div>
              </div>
              {s ? (
                <div className="stat-tiles">
                  <Tile k="Matches played" v={s.matchesPlayed} />
                  <Tile k="Win rate" v={`${s.winRate}%`} />
                  <Tile k="Wins" v={s.wins} />
                  <Tile k="Losses" v={s.losses} />
                  <Tile k="Total score" v={fmt(s.totalScore)} />
                  <Tile k="Average / match" v={fmt(s.averageScore)} />
                </div>
              ) : (
                <p className="muted-text">No finished team matches yet.</p>
              )}
            </div>
          </Sheet>
        );
      })()}
    </Screen>
  );
}

export function Tile({ k, v, s }: { k: string; v: string | number; s?: string }) {
  return (
    <div className="tile"><div className="k">{k}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>
  );
}
