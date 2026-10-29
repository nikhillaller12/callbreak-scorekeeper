/**
 * Canvas rendering of the shareable match card and the full scorecard, plus a tiny dependency-free PDF writer
 * (each page is a JPEG). Runs entirely in the browser.
 */
import { computeTotals, getStandings, getUnits, isTeamMatch, scoreAllRounds, unitMembersLabel } from '../domain/match';
import type { Avatar, Match, Unit } from '../domain/types';
import { fmt, formatDate, initials } from '../domain/util';

const GOLD = '#e8c766';
const CREAM = '#f6efd8';
const FELT_1 = '#0f3d2b';
const FELT_2 = '#082a1c';
const FONT = '-apple-system, "Segoe UI", system-ui, Helvetica, Arial, sans-serif';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

async function drawAvatar(ctx: CanvasRenderingContext2D, a: Avatar, name: string, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = a.color;
  ctx.fill();
  const img = a.image ? await loadImage(a.image) : null;
  if (img) {
    ctx.clip();
    const s = Math.max((r * 2) / img.width, (r * 2) / img.height);
    ctx.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2, img.width * s, img.height * s);
  } else {
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (a.emoji) {
      ctx.font = `${r * 1.1}px ${FONT}`;
      ctx.fillText(a.emoji, cx, cy + r * 0.05);
    } else {
      ctx.font = `700 ${r * 0.85}px ${FONT}`;
      ctx.fillText(initials(name), cx, cy + r * 0.04);
    }
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(3, r * 0.06);
  ctx.strokeStyle = GOLD;
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function felt(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createRadialGradient(w / 2, h * 0.35, 80, w / 2, h / 2, Math.max(w, h) * 0.8);
  g.addColorStop(0, FELT_1);
  g.addColorStop(1, FELT_2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(232,199,102,0.07)';
  ctx.font = `700 220px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♠', w * 0.16, h * 0.1);
  ctx.fillText('♥', w * 0.86, h * 0.9);
  ctx.fillText('♦', w * 0.88, h * 0.12);
  ctx.fillText('♣', w * 0.14, h * 0.88);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  roundRect(ctx, 28, 28, w - 56, h - 56, 36);
  ctx.stroke();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 700): string {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (ctx.measureText(text).width > maxW && s > 18) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  return ctx.font;
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d')! };
}

/** 1080×1350 portrait card (4:5 – works on WhatsApp, Instagram, Telegram, Facebook). */
export async function renderMatchCard(match: Match): Promise<HTMLCanvasElement> {
  const W = 1080, H = 1350;
  const { c, ctx } = canvas(W, H);
  felt(ctx, W, H);
  const standings = getStandings(match);
  const teamed = isTeamMatch(match);
  const tie = standings.filter((s) => s.rank === 1).length > 1;
  const top = standings[0];

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = GOLD;
  ctx.font = `800 64px ${FONT}`;
  ctx.fillText('🃏 CALL BREAK', W / 2, 140);
  ctx.fillStyle = 'rgba(246,239,216,0.7)';
  ctx.font = `500 30px ${FONT}`;
  fitText(ctx, match.name, W - 160, 30, 500);
  ctx.fillText(match.name, W / 2, 190);

  ctx.fillStyle = CREAM;
  const headline = match.rounds.length === 0 ? 'NO ROUNDS PLAYED' : tie ? 'IT’S A TIE' : `🏆 ${top.unit.name.toUpperCase()} WINS`;
  fitText(ctx, headline, W - 120, 74, 800);
  ctx.fillText(headline, W / 2, 290);

  const rows = standings.slice(0, 4);
  if (rows.length === 2) {
    const [a, b] = rows;
    await cardUnit(ctx, match, a.unit, a.total, W * 0.27, 660, a.rank === 1, teamed);
    await cardUnit(ctx, match, b.unit, b.total, W * 0.73, 660, b.rank === 1, teamed);
    ctx.fillStyle = GOLD;
    ctx.font = `800 60px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('VS', W / 2, 650);
  } else {
    const startY = 380;
    const rowH = 150;
    for (let i = 0; i < rows.length; i++) {
      const s = rows[i];
      const y = startY + i * rowH;
      ctx.fillStyle = s.rank === 1 ? 'rgba(232,199,102,0.18)' : 'rgba(0,0,0,0.25)';
      roundRect(ctx, 90, y, W - 180, rowH - 20, 28);
      ctx.fill();
      ctx.fillStyle = GOLD;
      ctx.font = `800 52px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${s.rank}`, 150, y + 84);
      await drawAvatar(ctx, s.unit.avatar, s.unit.name, 250, y + 55, 46);
      ctx.textAlign = 'left';
      ctx.fillStyle = CREAM;
      fitText(ctx, s.unit.name, 400, 40, 700);
      ctx.fillText(s.unit.name, 320, y + 70);
      ctx.textAlign = 'right';
      ctx.fillStyle = s.rank === 1 ? GOLD : CREAM;
      ctx.font = `800 54px ${FONT}`;
      ctx.fillText(fmt(s.total), W - 130, y + 76);
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = CREAM;
  ctx.font = `800 48px ${FONT}`;
  ctx.fillText(`${match.rounds.length} ROUND${match.rounds.length === 1 ? '' : 'S'}`, W / 2, 1090);
  ctx.fillStyle = 'rgba(246,239,216,0.7)';
  ctx.font = `500 34px ${FONT}`;
  ctx.fillText(formatDate(match.completedAt ?? match.updatedAt, { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase(), W / 2, 1145);

  ctx.fillStyle = 'rgba(232,199,102,0.5)';
  ctx.fillRect(W / 2 - 120, 1190, 240, 2);
  ctx.fillStyle = GOLD;
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText('♠ ♥ ♦ ♣  Call Break Scorekeeper', W / 2, 1245);
  return c;
}

async function cardUnit(ctx: CanvasRenderingContext2D, match: Match, unit: Unit, total: number, cx: number, cy: number, win: boolean, teamed: boolean) {
  await drawAvatar(ctx, unit.avatar, unit.name, cx, cy - 130, 96);
  ctx.textAlign = 'center';
  ctx.fillStyle = CREAM;
  const label = teamed ? unitMembersLabel(match, unit) : unit.name;
  fitText(ctx, label, 400, 34, 600);
  ctx.fillText(label, cx, cy + 20);
  if (teamed) {
    ctx.fillStyle = 'rgba(246,239,216,0.65)';
    fitText(ctx, unit.name, 400, 26, 500);
    ctx.fillText(unit.name, cx, cy + 58);
  }
  ctx.fillStyle = win ? GOLD : CREAM;
  ctx.font = `800 ${win ? 128 : 104}px ${FONT}`;
  ctx.fillText(fmt(total), cx, cy + 200);
}

/** Full scorecard table image (width 1080, height depends on rounds). */
export async function renderScorecard(match: Match): Promise<HTMLCanvasElement> {
  const W = 1080;
  const players = match.players;
  const units = getUnits(match);
  const teamed = isTeamMatch(match);
  const scores = scoreAllRounds(match);
  const totals = computeTotals(match);
  const rowH = 54;
  const headH = 260;
  const extraCols = teamed ? units.length : 0;
  const H = headH + (match.rounds.length + 3) * rowH + (teamed ? 160 : 90);
  const { c, ctx } = canvas(W, H);
  felt(ctx, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = GOLD;
  ctx.font = `800 52px ${FONT}`;
  ctx.fillText('🃏 CALL BREAK', W / 2, 120);
  ctx.fillStyle = CREAM;
  fitText(ctx, match.name, W - 160, 34, 600);
  ctx.fillText(match.name, W / 2, 170);
  ctx.fillStyle = 'rgba(246,239,216,0.7)';
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(formatDate(match.completedAt ?? match.updatedAt, { year: 'numeric', month: 'long', day: 'numeric' }), W / 2, 210);

  const cols = 1 + players.length + extraCols;
  const left = 70;
  const tableW = W - 140;
  const firstW = 100;
  const colW = (tableW - firstW) / (cols - 1);
  const colX = (i: number) => (i === 0 ? left + firstW / 2 : left + firstW + colW * (i - 1) + colW / 2);

  let y = headH - 10;
  ctx.fillStyle = 'rgba(232,199,102,0.2)';
  roundRect(ctx, left, y - 38, tableW, rowH, 14);
  ctx.fill();
  ctx.fillStyle = GOLD;
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText('#', colX(0), y);
  players.forEach((p, i) => {
    fitText(ctx, p.name, colW - 12, 24, 700);
    ctx.fillText(p.name, colX(i + 1), y);
  });
  units.slice(0, extraCols).forEach((u, i) => {
    fitText(ctx, u.name, colW - 12, 22, 700);
    ctx.fillText(u.name, colX(1 + players.length + i), y);
  });
  y += rowH;
  scores.forEach((s, ri) => {
    if (ri % 2 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(left, y - 38, tableW, rowH);
    }
    ctx.fillStyle = 'rgba(246,239,216,0.7)';
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(String(s.roundNumber), colX(0), y);
    players.forEach((p, i) => {
      const v = s.player[p.id] ?? 0;
      ctx.fillStyle = v < 0 ? '#ff8a80' : CREAM;
      ctx.font = `600 26px ${FONT}`;
      ctx.fillText(fmt(v), colX(i + 1), y);
    });
    units.slice(0, extraCols).forEach((u, i) => {
      const v = s.unit[u.id] ?? 0;
      ctx.fillStyle = v < 0 ? '#ff8a80' : GOLD;
      ctx.font = `700 26px ${FONT}`;
      ctx.fillText(fmt(v), colX(1 + players.length + i), y);
    });
    y += rowH;
  });
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, y - 36);
  ctx.lineTo(left + tableW, y - 36);
  ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.font = `800 24px ${FONT}`;
  ctx.fillText('TOTAL', colX(0), y + 4);
  ctx.font = `800 30px ${FONT}`;
  players.forEach((p, i) => ctx.fillText(fmt(totals.player[p.id] ?? 0), colX(i + 1), y + 4));
  units.slice(0, extraCols).forEach((u, i) => ctx.fillText(fmt(totals.unit[u.id] ?? 0), colX(1 + players.length + i), y + 4));
  y += rowH + 40;
  const st = getStandings(match);
  if (match.rounds.length > 0) {
    ctx.fillStyle = CREAM;
    ctx.font = `800 36px ${FONT}`;
    const winners = st.filter((s) => s.rank === 1);
    ctx.fillText(winners.length > 1 ? `Tie: ${winners.map((w) => w.unit.name).join(' & ')}` : `🏆 Winner: ${winners[0].unit.name}`, W / 2, y + 10);
  }
  ctx.fillStyle = 'rgba(232,199,102,0.8)';
  ctx.font = `600 24px ${FONT}`;
  ctx.fillText('♠ ♥ ♦ ♣  Call Break Scorekeeper', W / 2, H - 56);
  return c;
}

export function canvasToBlob(c: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not create image'))), type, quality));
}

/* ---------- minimal PDF (one JPEG per page) ---------- */

function dataUrlToBytes(url: string): Uint8Array {
  const b64 = url.split(',')[1] ?? '';
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface PdfPage {
  jpeg: Uint8Array;
  width: number;
  height: number;
}

/** Build a PDF where each page is sized to its image (scaled to A4-ish width in points). */
export function buildPdf(pages: PdfPage[]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (d: Uint8Array | string) => {
    const b = typeof d === 'string' ? enc.encode(d) : d;
    chunks.push(b);
    length += b.length;
  };
  const startObj = (n: number) => { offsets[n] = length; push(`${n} 0 obj\n`); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  // objects: 1 catalog, 2 pages, then per page: page, content, image
  const pageObjIds = pages.map((_, i) => 3 + i * 3);
  startObj(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj(2);
  push(`<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);
  pages.forEach((p, i) => {
    const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2;
    const pw = 595;
    const ph = Math.round((p.height / p.width) * pw);
    startObj(pid);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>\nendobj\n`);
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    startObj(cid);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    startObj(iid);
    push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    push(p.jpeg);
    push('\nendstream\nendobj\n');
  });
  const total = 2 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let n = 1; n <= total; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' });
}

export async function matchPdf(match: Match): Promise<Blob> {
  const [card, sheet] = await Promise.all([renderMatchCard(match), renderScorecard(match)]);
  const toPage = (cv: HTMLCanvasElement): PdfPage => ({ jpeg: dataUrlToBytes(cv.toDataURL('image/jpeg', 0.92)), width: cv.width, height: cv.height });
  return buildPdf([toPage(card), toPage(sheet)]);
}
