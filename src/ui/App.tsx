import { useEffect } from 'react';
import { configureAudio, unlockAudio } from '../audio/audio';
import { initStore, useStore } from '../state/store';
import { ConfirmHost, Toasts } from './components/common';
import { ErrorBoundary } from './components/Screen';
import { go, useRoute } from './router';
import { HistoryScreen } from './screens/History';
import { HomeScreen } from './screens/Home';
import { MatchDetailScreen } from './screens/MatchDetail';
import { NewMatchScreen } from './screens/NewMatch';
import { PlayScreen } from './screens/Play';
import { PlayersScreen } from './screens/Players';
import { SettingsScreen } from './screens/Settings';
import { StatsScreen } from './screens/Stats';

const NAV = [
  { to: '/', key: '', ico: '🏠', label: 'Home' },
  { to: '/history', key: 'history', ico: '📜', label: 'History' },
  { to: '/new', key: 'new', ico: '▶', label: 'Play' },
  { to: '/players', key: 'players', ico: '👥', label: 'Players' },
  { to: '/stats', key: 'stats', ico: '🏆', label: 'Stats' },
];

function Routes() {
  const { segments } = useRoute();
  const [a, b] = segments;
  useEffect(() => { window.scrollTo(0, 0); }, [a, b]);
  switch (a) {
    case undefined: return <HomeScreen />;
    case 'new': return <NewMatchScreen />;
    case 'play': return b ? <PlayScreen matchId={b} /> : <NotFound />;
    case 'match': return b ? <MatchDetailScreen matchId={b} /> : <NotFound />;
    case 'history': return <HistoryScreen />;
    case 'players': return <PlayersScreen />;
    case 'stats': return <StatsScreen />;
    case 'settings': return <SettingsScreen />;
    default: return <NotFound />;
  }
}

function NotFound() {
  useEffect(() => { go('/', true); }, []);
  return null;
}

export function App() {
  const { ready, data } = useStore();
  const { segments } = useRoute();
  const s = data.settings;

  useEffect(() => { void initStore(); }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', s.theme);
    try { localStorage.setItem('cb-theme', s.theme); } catch { /* ignore */ }
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', s.theme === 'light' ? '#f4eed9' : '#082a1c');
  }, [s.theme]);

  useEffect(() => {
    configureAudio({ soundEffects: s.soundEffects && !s.muted, music: s.music && !s.muted });
  }, [s.soundEffects, s.music, s.muted]);

  // Audio may only start from a real user gesture.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  const hideNav = segments[0] === 'play' || segments[0] === 'new';
  const current = segments[0] ?? '';

  return (
    <div className="app">
      <a href="#main" className="sr-only" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <ErrorBoundary>
        {ready ? <Routes /> : <main className="page"><div className="loading" aria-label="Loading">♠</div></main>}
      </ErrorBoundary>
      {!hideNav && (
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.key} href={'#' + n.to} aria-current={current === n.key || (n.key === 'history' && current === 'match') ? 'page' : undefined}>
              <span className="ico" aria-hidden="true">{n.ico}</span>{n.label}
            </a>
          ))}
        </nav>
      )}
      <ConfirmHost />
      <Toasts />
    </div>
  );
}
