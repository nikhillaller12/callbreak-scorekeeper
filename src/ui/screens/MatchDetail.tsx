import { useEffect, useState } from 'react';
import { play } from '../../audio/audio';
import { isTeamMatch, reopenMatch, unitMembersLabel } from '../../domain/match';
import { summarizeMatch } from '../../domain/stats';
import { fmt, formatDate } from '../../domain/util';
import { actions, toast, useStore } from '../../state/store';
import { ScoreChart } from '../components/charts';
import { Avatar, AvatarStack, Empty } from '../components/common';
import { Confetti, EditRoundSheet } from '../components/EditRound';
import { MatchMenuButton } from '../components/MatchActions';
import { Screen } from '../components/Screen';
import { ShareSheet } from '../components/ShareSheet';
import { go, useRoute } from '../router';
import { RoundsTable } from './Play';

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣'];

export function MatchDetailScreen({ matchId }: { matchId: string }) {
  const { data, ready } = useStore();
  const route = useRoute();
  const match = data.matches.find((m) => m.id === matchId);
  const justFinished = route.query.get('finished') === '1';
  const [confetti, setConfetti] = useState(justFinished);
  const [share, setShare] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);

  useEffect(() => {
    if (justFinished && match && match.rounds.length > 0) {
      const t = setTimeout(() => play('winner'), 250);
      return () => clearTimeout(t);
    }
  }, [justFinished, match?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <Screen><div className="loading" aria-label="Loading">♠</div></Screen>;
  if (!match) {
    return <Screen title="Match" back="/history"><Empty icon="🔍" title="Match not found">It may have been deleted. <a href="#/history">Back to history</a></Empty></Screen>;
  }
  if (match.status === 'in_progress') {
    go(`/play/${match.id}`, true);
    return null;
  }

  const sum = summarizeMatch(match);
  const teamed = isTeamMatch(match);
  const top = sum.standings.filter((s) => s.rank === 1);
  const tie = top.length > 1;
  const noRounds = match.rounds.length === 0;
  const winnerUnit = top[0]?.unit;

  const reopen = () => {
    void actions.saveMatch(reopenMatch(match));
    toast('Match reopened – keep scoring', 'success');
    go(`/play/${match.id}`);
  };

  return (
    <Screen title={match.name} back="/history" actions={<MatchMenuButton match={match} onDeleted={() => go('/history', true)} />}>
      {confetti && !noRounds && <Confetti onDone={() => setConfetti(false)} />}
      <div className="stack">
        <section className="card winner-hero" aria-label="Result">
          <div className="hint">{formatDate(match.completedAt ?? match.updatedAt, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
          {noRounds ? (
            <h2 style={{ marginTop: 8 }}>No rounds were played</h2>
          ) : (
            <>
              <div className="trophy" aria-hidden="true">🏆</div>
              <h2>{tie ? 'It’s a tie!' : `${winnerUnit.name} ${teamed ? 'wins' : 'wins'}!`}</h2>
              {!tie && teamed && <div className="muted-text">{unitMembersLabel(match, winnerUnit)}</div>}
              <div className="vs-line">
                {sum.standings.map((s, idx) => (
                  <div key={s.unit.id} style={{ display: 'contents' }}>
                    {idx > 0 && sum.standings.length === 2 && <span className="vs-mid" aria-hidden="true">VS</span>}
                    <div className={'vs-side' + (s.rank === 1 ? ' win' : '')}>
                      <Avatar avatar={s.unit.avatar} name={s.unit.name} size={s.rank === 1 ? 64 : 52} ring />
                      <span className="nm">{s.unit.name}</span>
                      <b className="score">{fmt(s.total)}</b>
                    </div>
                  </div>
                ))}
              </div>
              <div className="muted-text" style={{ marginTop: 8 }}>{sum.rounds} round{sum.rounds === 1 ? '' : 's'}</div>
            </>
          )}
        </section>

        <div className="btn-row">
          <button type="button" className="btn primary" style={{ flex: '1 1 140px' }} onClick={() => setShare(true)}>📤 Share / export</button>
          <button type="button" className="btn" style={{ flex: '1 1 140px' }} onClick={reopen}>▶ Reopen & continue</button>
        </div>

        {!noRounds && (
          <>
            <section className="card" aria-label="Final rankings">
              <h2 className="section-title">Final rankings</h2>
              <ol className="rank-list">
                {sum.standings.map((s) => (
                  <li key={s.unit.id}>
                    <span className="medal" aria-label={`Rank ${s.rank}`}>{MEDALS[s.rank - 1] ?? s.rank}</span>
                    <Avatar avatar={s.unit.avatar} name={s.unit.name} size={36} />
                    <span className="who">{s.unit.name}{teamed && <small>{unitMembersLabel(match, s.unit)}</small>}</span>
                    <span className="val">{fmt(s.total)}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section aria-label="Highlights">
              <h2 className="section-title">Highlights</h2>
              <div className="stat-tiles">
                <Hl k="Total rounds" v={String(sum.rounds)} />
                <Hl k="Best round" v={sum.bestRound ? fmt(sum.bestRound.score) : '–'} s={sum.bestRound ? `${sum.bestRound.unitName} · round ${sum.bestRound.roundNumber}` : undefined} />
                <Hl k="Highest call" v={sum.highestCall ? String(sum.highestCall.call) : '–'} s={sum.highestCall ? `${sum.highestCall.playerName} · round ${sum.highestCall.roundNumber} · ${sum.highestCall.made ? 'made' : 'failed'}` : undefined} />
                <Hl k="Most successful calls" v={sum.mostSuccessfulCalls ? String(sum.mostSuccessfulCalls.count) : '–'} s={sum.mostSuccessfulCalls?.playerName} />
                <Hl k="Most tricks" v={sum.mostTricks ? String(sum.mostTricks.count) : '–'} s={sum.mostTricks?.playerName} />
                <Hl k="Longest winning streak" v={sum.longestStreak ? `${sum.longestStreak.length} rounds` : '–'} s={sum.longestStreak?.unitName ?? 'Best score in consecutive rounds'} />
              </div>
            </section>

            <section className="card" aria-label="Score progression">
              <h2 className="section-title">Score progression</h2>
              <ScoreChart match={match} />
            </section>

            <section className="card" aria-label="Player statistics">
              <h2 className="section-title">Player statistics</h2>
              <div className="table-wrap" style={{ border: 0 }}>
                <table className="sheet-table">
                  <thead>
                    <tr><th scope="col" style={{ textAlign: 'left' }}>Player</th><th scope="col">Score</th><th scope="col">Tricks</th><th scope="col">Made</th><th scope="col">Failed</th></tr>
                  </thead>
                  <tbody>
                    {sum.players.map((p) => (
                      <tr key={p.playerId}>
                        <td style={{ textAlign: 'left', position: 'static', width: 'auto', color: 'inherit' }}><span className="row" style={{ gap: 8 }}><AvatarStack size={24} items={[{ avatar: p.avatar, name: p.name }]} /> {p.name}</span></td>
                        <td><b>{fmt(p.total)}</b></td><td>{p.tricks}</td><td>{p.made}/{p.calls}</td><td>{p.failed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        <section aria-label="Full scorecard" className="stack-sm">
          <h2 className="section-title">Scorecard</h2>
          {noRounds ? <p className="muted-text">Nothing scored.</p> : <RoundsTable match={match} onEdit={setEditing} />}
          <p className="hint">Tap ✏️ to correct a round – totals, winner and statistics update automatically.</p>
        </section>

        <div className="muted-text" style={{ textAlign: 'center' }}>
          Scoring: {match.scoringId === 'standard' ? 'Standard' : 'Whole points'}
        </div>
      </div>

      {share && <ShareSheet match={match} onClose={() => setShare(false)} />}
      {editing !== null && <EditRoundSheet match={match} roundNumber={editing} onClose={() => setEditing(null)} />}
    </Screen>
  );
}

function Hl({ k, v, s }: { k: string; v: string; s?: string }) {
  return <div className="tile"><div className="k">{k}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>;
}
