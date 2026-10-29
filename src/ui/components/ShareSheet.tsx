import { useEffect, useState } from 'react';
import { winnerLabel } from '../../domain/match';
import type { Match } from '../../domain/types';
import { canvasToBlob, matchPdf, renderMatchCard, renderScorecard } from '../../share/cardRenderer';
import { copyText, downloadBlob, downloadText, matchCsv, matchFileName, matchJson, nativeShare, shareText } from '../../share/exporters';
import { play } from '../../audio/audio';
import { toast } from '../../state/store';
import { Sheet } from './common';

export function ShareSheet({ match, onClose }: { match: Match; onClose: () => void }) {
  const text = shareText(match);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    renderMatchCard(match)
      .then((c) => canvasToBlob(c, 'image/png'))
      .then((b) => {
        if (cancelled) return;
        url = URL.createObjectURL(b);
        setPreviewUrl(url);
      })
      .catch(() => undefined);
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [match]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { console.error(e); toast('That did not work. Try another option.', 'error'); } finally { setBusy(null); }
  };

  const cardFile = async () => new File([await canvasToBlob(await renderMatchCard(match))], matchFileName(match, 'png'), { type: 'image/png' });

  const share = () => run('share', async () => {
    const file = await cardFile().catch(() => undefined);
    const r = await nativeShare({ title: `Call Break – ${match.name}`, text, file });
    if (r === 'unsupported') {
      const ok = await copyText(text);
      toast(ok ? 'Sharing isn’t supported here – summary copied instead' : 'Sharing isn’t supported here. Use Copy or Download.', ok ? 'info' : 'error');
    } else if (r === 'shared') play('tap');
  });
  const copy = () => run('copy', async () => {
    toast((await copyText(text)) ? 'Summary copied' : 'Could not copy. Select the text and copy manually.', 'success');
  });
  const image = () => run('image', async () => { downloadBlob(await canvasToBlob(await renderMatchCard(match)), matchFileName(match, 'png')); });
  const sheetImg = () => run('sheet', async () => { downloadBlob(await canvasToBlob(await renderScorecard(match)), matchFileName(match, 'scorecard.png')); });
  const pdf = () => run('pdf', async () => { downloadBlob(await matchPdf(match), matchFileName(match, 'pdf')); });

  return (
    <Sheet title="Share match" onClose={onClose} wide>
      <div className="stack">
        {previewUrl ? (
          <img className="share-preview" src={previewUrl} alt={`Match result card: ${winnerLabel(match)}`} />
        ) : (
          <div className="share-preview" aria-busy="true" style={{ display: 'grid', placeItems: 'center' }}>Making card…</div>
        )}
        <div className="btn-row">
          <button type="button" className="btn primary" style={{ flex: '1 1 140px' }} disabled={!!busy} onClick={share}>📤 Share</button>
          <button type="button" className="btn" style={{ flex: '1 1 140px' }} disabled={!!busy} onClick={copy}>📋 Copy summary</button>
        </div>
        <div>
          <div className="section-title">Download</div>
          <div className="btn-row">
            <button type="button" className="btn small" disabled={!!busy} onClick={image}>🖼 Match card (PNG)</button>
            <button type="button" className="btn small" disabled={!!busy} onClick={sheetImg}>🧾 Scorecard (PNG)</button>
            <button type="button" className="btn small" disabled={!!busy} onClick={pdf}>📄 PDF</button>
            <button type="button" className="btn small" onClick={() => downloadText(matchCsv(match), matchFileName(match, 'csv'), 'text/csv;charset=utf-8')}>📊 CSV</button>
            <button type="button" className="btn small" onClick={() => downloadText(matchJson(match), matchFileName(match, 'json'), 'application/json')}>{'{ }'} JSON</button>
          </div>
        </div>
        <div>
          <div className="section-title">Text summary</div>
          <pre className="share-text" tabIndex={0} aria-label="Share summary text">{text}</pre>
        </div>
      </div>
    </Sheet>
  );
}
