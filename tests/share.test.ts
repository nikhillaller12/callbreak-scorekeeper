import { describe, expect, it } from 'vitest';
import { demoData } from '../src/domain/demo';
import { backupJson, matchCsv, matchFileName, matchJson, shareText } from '../src/share/exporters';
import { buildPdf } from '../src/share/cardRenderer';
import { parseBackup } from '../src/domain/sanitize';
import { DEFAULT_SETTINGS } from '../src/domain/types';

const d = demoData();
const m = d.matches[0];

describe('share text', () => {
  it('names the winner and both teams with points', () => {
    const t = shareText(m);
    expect(t).toContain('CALL BREAK');
    expect(t).toContain('WINNER');
    expect(t).toContain('Team A');
    expect(t).toContain('Team B');
    expect(t).toContain('Nikhil + Amit');
    expect(t).toContain(`Rounds: ${m.rounds.length}`);
    expect(t).toMatch(/\d+\.\d points/);
  });
});

describe('csv', () => {
  it('has header, one row per round and a total row', () => {
    const lines = matchCsv(m).trim().split('\r\n');
    expect(lines).toHaveLength(m.rounds.length + 2);
    expect(lines[0].startsWith('Round,')).toBe(true);
    expect(lines[lines.length - 1].startsWith('TOTAL')).toBe(true);
  });
  it('neutralises formula injection and escapes commas', () => {
    const evil = { ...m, players: m.players.map((p, i) => (i === 0 ? { ...p, name: '=1+1,"x"' } : p)) };
    const header = matchCsv(evil).split('\r\n')[0];
    expect(header).toContain(`"'=1+1,""x"" call"`);
  });
});

describe('json + filenames', () => {
  it('match json parses back', () => {
    expect(JSON.parse(matchJson(m)).match.id).toBe(m.id);
  });
  it('backup json is accepted by the importer', () => {
    expect(parseBackup(backupJson({ ...d, settings: DEFAULT_SETTINGS })).ok).toBe(true);
  });
  it('safe file names', () => {
    expect(matchFileName({ ...m, name: 'Fri/Night: "Fun"!' }, 'csv')).toMatch(/^callbreak-fri-night-fun-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});

describe('pdf writer', () => {
  it('produces a structurally valid PDF with correct xref offsets', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const blob = buildPdf([{ jpeg, width: 100, height: 200 }, { jpeg, width: 100, height: 100 }]);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder('latin1').decode(buf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const xrefPos = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xrefPos, xrefPos + 4)).toBe('xref');
    const entries = [...text.slice(xrefPos).matchAll(/(\d{10}) 00000 n/g)].map((x) => Number(x[1]));
    expect(entries).toHaveLength(2 + 2 * 3);
    entries.forEach((off, i) => expect(text.slice(off, off + 7)).toBe(`${i + 1} 0 obj`));
  });
});
