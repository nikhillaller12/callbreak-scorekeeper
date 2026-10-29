import { useStore, dismissLoadProblem, actions } from '../../state/store';
import { MatchCard } from '../components/MatchCard';
import { MatchMenuButton } from '../components/MatchActions';
import { Screen } from '../components/Screen';
import { Suit } from '../components/common';
import { go } from '../router';

export function HomeScreen() {
  const { data, loadProblem } = useStore();
  const matches = [...data.matches].sort((a, b) => b.updatedAt - a.updatedAt);
  const inProgress = matches.filter((m) => m.status === 'in_progress');
  const recent = matches.filter((m) => m.status === 'completed').slice(0, 4);
  const empty = data.matches.length === 0 && data.players.length === 0;

  return (
    <Screen>
      <div className="stack">
        <div className="hero">
          <div className="suits" aria-hidden="true"><Suit s="♠" /> <Suit s="♥" /> <Suit s="♦" /> <Suit s="♣" /></div>
          <div className="logo">CALL BREAK</div>
          <p>“Track the game. Win the bragging rights.”</p>
        </div>

        {loadProblem && (
          <div className="banner" role="alert">
            <span aria-hidden="true">⚠️</span>
            <div style={{ flex: 1 }}>
              <b>{loadProblem.failed ? 'Saved data could not be read.' : `${loadProblem.dropped} damaged record${loadProblem.dropped === 1 ? ' was' : 's were'} skipped.`}</b>
              <div className="muted-text">Everything else loaded normally. Export a backup from Settings to be safe.</div>
              <div className="btn-row" style={{ marginTop: 8 }}>
                <button type="button" className="btn small" onClick={() => go('/settings')}>Open settings</button>
                <button type="button" className="btn small ghost" onClick={dismissLoadProblem}>Dismiss</button>
              </div>
            </div>
          </div>
        )}

        <button type="button" className="btn primary big" onClick={() => go('/new')}>▶ New Match</button>

        <div className="nav-grid">
          <a className="nav-tile" href="#/history"><span className="ico" aria-hidden="true">📜</span> Match History</a>
          <a className="nav-tile" href="#/players"><span className="ico" aria-hidden="true">👥</span> Players</a>
          <a className="nav-tile" href="#/stats"><span className="ico" aria-hidden="true">🏆</span> Statistics</a>
          <a className="nav-tile" href="#/settings"><span className="ico" aria-hidden="true">⚙</span> Settings</a>
        </div>

        {inProgress.length > 0 && (
          <section className="stack-sm" aria-label="Unfinished matches">
            <h2 className="section-title">Continue playing</h2>
            {inProgress.map((m) => (
              <MatchCard key={m.id} match={m} onOpen={() => go(`/play/${m.id}`)} menu={<MatchMenuButton match={m} />} />
            ))}
          </section>
        )}

        <section className="stack-sm" aria-label="Recent matches">
          <h2 className="section-title">Recent matches</h2>
          {recent.length === 0 ? (
            <div className="card flat empty">
              <div className="empty-icon" aria-hidden="true">🃏</div>
              <h3>No finished matches yet</h3>
              <p className="muted-text">Start a match and it will show up here.</p>
              {empty && (
                <button type="button" className="btn small" style={{ marginTop: 12 }} onClick={() => void actions.loadDemo()}>Try with demo data</button>
              )}
            </div>
          ) : (
            recent.map((m) => <MatchCard key={m.id} match={m} onOpen={() => go(`/match/${m.id}`)} menu={<MatchMenuButton match={m} />} />)
          )}
          {recent.length > 0 && <a className="btn block" href="#/history">View all history</a>}
        </section>
      </div>
    </Screen>
  );
}
