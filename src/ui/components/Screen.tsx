import { Component, type ReactNode } from 'react';
import { actions, getState, toast, useStore } from '../../state/store';
import { backupJson, downloadText } from '../../share/exporters';
import { go } from '../router';

export function Screen({ title, back, actions: extra, children, bare }: { title?: string; back?: string; actions?: ReactNode; children: ReactNode; bare?: boolean }) {
  const { data } = useStore();
  const s = data.settings;
  return (
    <>
      <header className="topbar">
        {back ? (
          <button type="button" className="icon-btn" aria-label="Back" onClick={() => go(back)}>←</button>
        ) : (
          <a className="brand" href="#/" aria-label="Call Break home"><span aria-hidden="true">♠</span> CALL BREAK</a>
        )}
        {back || title ? <h1>{title}</h1> : <span className="spacer" />}
        {extra}
        <button type="button" className="icon-btn" aria-label={s.muted ? 'Unmute sounds' : 'Mute sounds'} aria-pressed={s.muted} onClick={() => void actions.updateSettings({ muted: !s.muted })}>
          <span aria-hidden="true">{s.muted ? '🔇' : '🔊'}</span>
        </button>
        <a className="icon-btn" href="#/settings" aria-label="Settings"><span aria-hidden="true">⚙</span></a>
      </header>
      <main className={'page' + (bare ? ' no-nav' : '')} id="main">{children}</main>
    </>
  );
}

interface EBState { error: Error | null }
/** Last line of defence: a render bug must never white-screen the app or hide the user's data. */
export class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page stack">
        <div className="card stack">
          <h2>Something went wrong</h2>
          <p className="muted-text">Your saved data has not been touched. You can download a backup and then reload the app.</p>
          <p className="hint">{this.state.error.message}</p>
          <div className="btn-row">
            <button className="btn primary" type="button" onClick={() => { downloadText(backupJson(getState().data), 'callbreak-backup.json', 'application/json'); toast('Backup downloaded', 'success'); }}>Download backup</button>
            <button className="btn" type="button" onClick={() => { this.setState({ error: null }); go('/', true); }}>Back to home</button>
            <button className="btn" type="button" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </main>
    );
  }
}
