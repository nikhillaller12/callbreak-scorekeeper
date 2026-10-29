import { useMemo, useState } from 'react';
import { play } from '../../audio/audio';
import { createMatch, validateSetup } from '../../domain/match';
import { PLAYER_COUNT, type Avatar as AvatarT, type GameMode, type MatchPlayer, type MatchTeam, type Player, type ScoringId, type Team } from '../../domain/types';
import { SCORING_RULES } from '../../domain/scoring';
import { cleanText, uid } from '../../domain/util';
import { actions, toast, useStore } from '../../state/store';
import { defaultAvatar } from '../avatars';
import { Avatar, AvatarEditor, Field, Segmented, Sheet } from '../components/common';
import { Screen } from '../components/Screen';
import { go } from '../router';

interface Seat {
  key: string;
  /** Saved player this seat is linked to. */
  playerId: string | null;
  name: string;
  avatar: AvatarT | null;
}
interface TeamDraft {
  key: string;
  name: string;
  avatar: AvatarT;
  savedTeamId?: string;
}

const TEAM_DEFAULTS: { name: string; avatar: AvatarT }[] = [
  { name: 'Team A', avatar: { color: '#1e8449', emoji: '♠' } },
  { name: 'Team B', avatar: { color: '#a93226', emoji: '♥' } },
];
const SOLO_SUITS = ['♠', '♥', '♦', '♣'];

function seatFromPlayer(p: Player): Seat {
  return { key: uid(), playerId: p.id, name: p.name, avatar: p.avatar };
}
const blankSeat = (): Seat => ({ key: uid(), playerId: null, name: '', avatar: null });

export function NewMatchScreen() {
  const { data } = useStore();
  const settings = data.settings;

  const [mode, setMode] = useState<GameMode>(settings.defaultMode);
  const [scoringId, setScoringId] = useState<ScoringId>(settings.defaultScoring);
  const [matchName, setMatchName] = useState('');
  const [seats, setSeats] = useState<Seat[]>(() => {
    const prev = settings.lastPlayerIds.map((id) => data.players.find((p) => p.id === id)).filter((p): p is Player => !!p);
    const pool = prev.length === PLAYER_COUNT ? prev : data.players.slice(0, PLAYER_COUNT);
    return Array.from({ length: PLAYER_COUNT }, (_, i) => (pool[i] ? seatFromPlayer(pool[i]) : blankSeat()));
  });
  /** teamOf[i] = 0|1 for 2-team mode */
  const [teamOf, setTeamOf] = useState<number[]>([0, 0, 1, 1]);
  const [teams2, setTeams2] = useState<TeamDraft[]>(() => TEAM_DEFAULTS.map((t) => ({ key: uid(), ...t })));
  const [teams4, setTeams4] = useState<Record<string, { name?: string; avatar?: AvatarT }>>({});
  const [pickSeat, setPickSeat] = useState<number | null>(null);
  const [avatarSeat, setAvatarSeat] = useState<number | null>(null);
  const [teamEdit, setTeamEdit] = useState<number | null>(null);
  const [pickTeam, setPickTeam] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const usedIds = new Set(seats.map((s) => s.playerId).filter(Boolean));

  const patchSeat = (i: number, patch: Partial<Seat>) => setSeats((ss) => ss.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  /** Typing a name that matches a saved player links the seat to that profile. */
  const onName = (i: number, name: string) => {
    const match = data.players.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (match && !seats.some((s, k) => k !== i && s.playerId === match.id)) patchSeat(i, { name, playerId: match.id, avatar: match.avatar });
    else patchSeat(i, { name, playerId: null });
  };

  const seatAvatar = (s: Seat): AvatarT => s.avatar ?? defaultAvatar(s.name || s.key);

  const build = () => {
    const resolved: MatchPlayer[] = seats.map((s) => ({
      id: s.playerId ?? s.key,
      name: cleanText(s.name, 30),
      avatar: seatAvatar(s),
    }));
    let teams: MatchTeam[] = [];
    if (mode === 'teams2') {
      teams = teams2.map((t, ti) => ({
        id: t.key,
        name: cleanText(t.name, 30),
        avatar: t.avatar,
        savedTeamId: t.savedTeamId,
        playerIds: resolved.filter((_, i) => teamOf[i] === ti).map((p) => p.id),
      }));
    } else if (mode === 'teams4') {
      teams = resolved.map((p, i) => ({
        id: 't-' + seats[i].key,
        name: cleanText(teams4[seats[i].key]?.name ?? p.name, 30),
        avatar: teams4[seats[i].key]?.avatar ?? { ...p.avatar },
        playerIds: [p.id],
      }));
    }
    return { name: matchName, mode, scoringId, players: resolved, teams };
  };

  const setup = build();
  const validation = validateSetup(setup);

  const start = async () => {
    setShowErrors(true);
    if (!validation.ok) {
      toast(validation.errors[0], 'error');
      return;
    }
    const now = Date.now();
    // Persist brand-new players so they keep stats and can be reused.
    for (const s of seats) {
      if (!s.playerId) {
        const p = setup.players.find((x) => x.id === s.key)!;
        await actions.savePlayer({ id: p.id, name: p.name, avatar: p.avatar, createdAt: now, updatedAt: now });
      }
    }
    // Save/link 2-team profiles so they can be reused.
    const finalTeams = [...setup.teams];
    if (mode === 'teams2') {
      for (let i = 0; i < finalTeams.length; i++) {
        const t = finalTeams[i];
        const existing = (t.savedTeamId && data.teams.find((x) => x.id === t.savedTeamId)) || data.teams.find((x) => x.name.trim().toLowerCase() === t.name.toLowerCase());
        if (existing) {
          finalTeams[i] = { ...t, savedTeamId: existing.id };
          await actions.saveTeam({ ...existing, avatar: t.avatar, playerIds: t.playerIds, updatedAt: now });
        } else {
          const id = uid();
          finalTeams[i] = { ...t, savedTeamId: id };
          const team: Team = { id, name: t.name, avatar: t.avatar, playerIds: t.playerIds, createdAt: now, updatedAt: now };
          await actions.saveTeam(team);
        }
      }
    }
    const match = createMatch({ ...setup, teams: finalTeams }, now);
    await actions.saveMatch(match);
    await actions.updateSettings({ lastPlayerIds: setup.players.map((p) => p.id), defaultMode: mode, defaultScoring: scoringId });
    play('newRound');
    go(`/play/${match.id}`);
  };

  const teamCounts = useMemo(() => [0, 1].map((t) => teamOf.filter((x) => x === t).length), [teamOf]);

  const applySavedTeam = (ti: number, t: Team) => {
    setTeams2((ts) => ts.map((x, k) => (k === ti ? { ...x, name: t.name, avatar: t.avatar, savedTeamId: t.id } : x)));
    // seats that belong to this saved team join it, and leave the other if they were there
    setTeamOf((to) => to.map((v, i) => (seats[i].playerId && t.playerIds.includes(seats[i].playerId!) ? ti : v)));
    setPickTeam(null);
  };

  return (
    <Screen title="New match" back="/" bare>
      <div className="stack">
        <section aria-label="Game mode" className="stack-sm">
          <h2 className="section-title">Game mode</h2>
          <Segmented<GameMode>
            label="Game mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'individual', label: 'Individual' },
              { value: 'teams2', label: '2 Teams' },
              { value: 'teams4', label: '4 Teams' },
            ]}
          />
          <p className="hint">
            {mode === 'individual' && 'Every player scores for themselves.'}
            {mode === 'teams2' && 'Two teams – tap a player’s team badge to move them. Team score is the sum of its players.'}
            {mode === 'teams4' && 'Four teams of one – each player is their own team, with a team name and logo.'}
          </p>
        </section>

        <section aria-label="Players" className="stack-sm">
          <h2 className="section-title">Players</h2>
          {seats.map((s, i) => {
            const nameErr = showErrors && !cleanText(s.name);
            return (
              <div className="seat" key={s.key}>
                <button type="button" className="avatar-btn" aria-label={`Change avatar for player ${i + 1}`} onClick={() => setAvatarSeat(i)}>
                  <Avatar avatar={seatAvatar(s)} name={s.name || '?'} size={52} ring />
                </button>
                <div className="seat-main">
                  <label className="sr-only" htmlFor={`pname-${s.key}`}>Player {i + 1} name</label>
                  <input
                    id={`pname-${s.key}`}
                    type="text"
                    value={s.name}
                    maxLength={30}
                    autoComplete="off"
                    placeholder={`Player ${i + 1} name`}
                    aria-invalid={nameErr}
                    onChange={(e) => onName(i, e.target.value)}
                  />
                  <div className="seat-actions">
                    {data.players.length > 0 && (
                      <button type="button" className="btn small" onClick={() => setPickSeat(i)}>👤 Saved players</button>
                    )}
                    {mode === 'teams2' && (
                      <button
                        type="button"
                        className={'team-tag t' + teamOf[i]}
                        aria-label={`${s.name || 'Player ' + (i + 1)} is in ${teams2[teamOf[i]].name}. Tap to switch team.`}
                        onClick={() => setTeamOf((to) => to.map((v, k) => (k === i ? 1 - v : v)))}
                      >
                        {teams2[teamOf[i]].avatar.emoji} {teams2[teamOf[i]].name}
                      </button>
                    )}
                    {mode === 'teams4' && (
                      <button type="button" className="btn small" onClick={() => setTeamEdit(i)}>
                        {(teams4[s.key]?.avatar?.emoji ?? SOLO_SUITS[i])} Team: {teams4[s.key]?.name ?? (s.name || '…')}
                      </button>
                    )}
                  </div>
                  {nameErr && <span className="error-text" role="alert">Enter a name</span>}
                </div>
              </div>
            );
          })}
        </section>

        {mode === 'teams2' && (
          <section aria-label="Teams" className="stack-sm">
            <h2 className="section-title">Teams</h2>
            {teams2.map((t, ti) => (
              <div className="seat" key={t.key}>
                <button type="button" className="avatar-btn" aria-label={`Edit ${t.name}`} onClick={() => setTeamEdit(ti)}>
                  <Avatar avatar={t.avatar} name={t.name} size={52} ring />
                </button>
                <div className="seat-main">
                  <b>{t.name}</b>
                  <span className="muted-text">
                    {seats.filter((_, i) => teamOf[i] === ti).map((s) => s.name || '…').join(' + ') || 'No players'}
                  </span>
                  <div className="seat-actions">
                    <button type="button" className="btn small" onClick={() => setTeamEdit(ti)}>✏️ Name & logo</button>
                    {data.teams.length > 0 && <button type="button" className="btn small" onClick={() => setPickTeam(ti)}>👥 Saved teams</button>}
                  </div>
                </div>
              </div>
            ))}
            {teamCounts.some((c) => c === 0) && <p className="error-text" role="alert">Each team needs at least one player.</p>}
          </section>
        )}

        <section aria-label="Options" className="stack-sm">
          <h2 className="section-title">Options</h2>
          <Field label="Match name (optional)">
            {(id) => <input id={id} type="text" value={matchName} maxLength={60} placeholder="e.g. Friday Night Call Break" onChange={(e) => setMatchName(e.target.value)} />}
          </Field>
          <Field label="Scoring" hint={SCORING_RULES[scoringId].description}>
            {(id) => (
              <select id={id} value={scoringId} onChange={(e) => setScoringId(e.target.value as ScoringId)}>
                {Object.values(SCORING_RULES).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            )}
          </Field>
        </section>

        {showErrors && !validation.ok && (
          <div className="banner" role="alert">
            <span aria-hidden="true">⚠️</span>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{validation.errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="play-bar">
        <div className="play-bar-inner">
          <button type="button" className="btn primary" onClick={() => void start()}>▶ Start match</button>
        </div>
      </div>

      {pickSeat !== null && (
        <Sheet title="Choose a saved player" onClose={() => setPickSeat(null)}>
          <div className="pick-list">
            {data.players.map((p) => {
              const takenElsewhere = usedIds.has(p.id) && seats[pickSeat].playerId !== p.id;
              return (
                <button key={p.id} type="button" className="pick-item" disabled={takenElsewhere} onClick={() => { patchSeat(pickSeat, { playerId: p.id, name: p.name, avatar: p.avatar }); setPickSeat(null); }}>
                  <Avatar avatar={p.avatar} name={p.name} size={40} ring />
                  <span className="nm">{p.name}{takenElsewhere && <small>Already in this match</small>}</span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}

      {avatarSeat !== null && (
        <Sheet title="Player avatar" onClose={() => setAvatarSeat(null)} footer={<button type="button" className="btn primary" onClick={() => setAvatarSeat(null)}>Done</button>}>
          <AvatarEditor value={seatAvatar(seats[avatarSeat])} name={seats[avatarSeat].name} onChange={(a) => patchSeat(avatarSeat, { avatar: a })} />
        </Sheet>
      )}

      {teamEdit !== null && mode === 'teams2' && (
        <TeamLook
          title="Team name & logo"
          name={teams2[teamEdit].name}
          avatar={teams2[teamEdit].avatar}
          onClose={() => setTeamEdit(null)}
          onChange={(name, avatar) => setTeams2((ts) => ts.map((t, k) => (k === teamEdit ? { ...t, name, avatar, savedTeamId: t.name === name ? t.savedTeamId : undefined } : t)))}
        />
      )}
      {teamEdit !== null && mode === 'teams4' && (
        <TeamLook
          title="Team name & logo"
          name={teams4[seats[teamEdit].key]?.name ?? seats[teamEdit].name}
          avatar={teams4[seats[teamEdit].key]?.avatar ?? seatAvatar(seats[teamEdit])}
          onClose={() => setTeamEdit(null)}
          onChange={(name, avatar) => setTeams4((m) => ({ ...m, [seats[teamEdit].key]: { name, avatar } }))}
        />
      )}

      {pickTeam !== null && (
        <Sheet title="Choose a saved team" onClose={() => setPickTeam(null)}>
          <div className="pick-list">
            {data.teams.map((t) => (
              <button key={t.id} type="button" className="pick-item" onClick={() => applySavedTeam(pickTeam, t)}>
                <Avatar avatar={t.avatar} name={t.name} size={40} ring />
                <span className="nm">{t.name}<small>{t.playerIds.map((id) => data.players.find((p) => p.id === id)?.name).filter(Boolean).join(' + ')}</small></span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </Screen>
  );
}

function TeamLook({ title, name, avatar, onChange, onClose }: { title: string; name: string; avatar: AvatarT; onChange: (name: string, avatar: AvatarT) => void; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose} footer={<button type="button" className="btn primary" onClick={onClose}>Done</button>}>
      <div className="stack">
        <Field label="Team name" error={cleanText(name) ? undefined : 'Please enter a team name'}>
          {(id) => <input id={id} type="text" data-autofocus value={name} maxLength={30} onChange={(e) => onChange(e.target.value, avatar)} />}
        </Field>
        <AvatarEditor value={avatar} name={name} onChange={(a) => onChange(name, a)} />
      </div>
    </Sheet>
  );
}
