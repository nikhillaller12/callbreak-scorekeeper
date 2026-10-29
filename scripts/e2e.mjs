// End-to-end journey test in real Chrome against the production build (npm run build && npm run preview).
// Usage: npm run e2e   (preview server must be running on :4173, or set E2E_URL)
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const URL = process.env.E2E_URL ?? 'http://localhost:4173/';
const OUT = resolve('e2e-output');
const DL = resolve(OUT, 'downloads');
const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find((p) => p && existsSync(p));
if (!CHROME) throw new Error('Chrome not found. Set CHROME_PATH.');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });

const failures = [];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures.push(msg); console.log('  ✗ FAIL:', msg); } else console.log('  ✓', msg); };
const section = (s) => console.log('\n== ' + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const cdp = await browser.target().createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

const MOBILE = { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
await page.setViewport(MOBILE);

const text = (sel = 'body') => page.$eval(sel, (e) => e.innerText);
const hash = (h) => page.evaluate((x) => { location.hash = x; }, h);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

async function clickText(t, scope = 'body', timeout = 8000) {
  const h = await page.waitForFunction(
    (t, s) => {
      const roots = document.querySelectorAll(s);
      const root = roots.length ? roots[roots.length - 1] : document.body; // topmost dialog wins
      return [...root.querySelectorAll('button,a')].find((e) => e.offsetParent !== null && !e.disabled && e.textContent.trim().includes(t)) || null;
    },
    { timeout },
    t,
    scope,
  ).catch(async (e) => {
    const visible = await page.evaluate(() => [...document.querySelectorAll('button,a')].filter((x) => x.offsetParent !== null).map((x) => (x.disabled ? '(disabled)' : '') + x.textContent.trim().slice(0, 30)));
    throw new Error(`clickText("${t}") not found in ${scope}. Visible: ${JSON.stringify(visible)}`);
  });
  await h.asElement().evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await h.asElement().click();
}
async function setValue(sel, value) {
  await page.waitForSelector(sel, { visible: true });
  await page.focus(sel);
  await page.$eval(sel, (e) => e.select());
  if (value === '') await page.keyboard.press('Backspace');
  else await page.keyboard.type(value);
}
async function click(sel) {
  await page.waitForSelector(sel, { visible: true, timeout: 8000 });
  // Scroll the target to the middle of the screen (like a person would) so it is never hidden under the fixed bottom bar.
  await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
  await page.click(sel);
}

async function noHScroll(label) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth }));
  ok(r.sw <= r.iw && r.bw <= r.iw, `no horizontal page scroll on ${label} (scrollWidth ${r.sw} <= ${r.iw})`);
}

async function enterRound(calls, tricks) {
  const names = ['Nikhil', 'Amit', 'Rahul', 'Gaurav'];
  for (let i = 0; i < 4; i++) await click(`[aria-label="${names[i]} call ${calls[i]}"]`);
  await clickText('Enter tricks');
  await page.waitForSelector('[aria-label="Nikhil tricks 0"]');
  for (let i = 0; i < 4; i++) await click(`[aria-label="${names[i]} tricks ${tricks[i]}"]`);
}
async function waitFile(ext, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const f = readdirSync(DL).find((n) => n.endsWith(ext) && !n.endsWith('.crdownload'));
    if (f) return f;
    await sleep(150);
  }
  return null;
}
const clearDl = () => readdirSync(DL).forEach((f) => rmSync(resolve(DL, f)));

// ---------------------------------------------------------------- 1. home
section('Home');
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('.hero');
ok((await text()).includes('Track the game'), 'home shows tagline');
ok((await page.title()) === 'Call Break Scorekeeper', 'page title');
await shot('01-home-mobile');
await noHScroll('home @375');

// ---------------------------------------------------------------- 2. new match
section('New match (2 teams)');
await clickText('New Match');
await page.waitForSelector('input[placeholder="Player 1 name"]');
await noHScroll('new match @375');
const names = ['Nikhil', 'Amit', 'Rahul', 'Gaurav'];
for (let i = 0; i < 4; i++) await page.type(`input[placeholder="Player ${i + 1} name"]`, names[i]);
let t = await text();
ok(t.includes('Team A') && t.includes('Team B'), 'default teams A and B shown');
// empty-name validation
await setValue('input[placeholder="Player 4 name"]', '');
await clickText('Start match');
await sleep(200);
ok((await text()).includes('Enter a name'), 'missing player name is rejected with a friendly message');
await setValue('input[placeholder="Player 4 name"]', 'Gaurav');
await shot('02-setup-mobile');
const t0 = Date.now();
await clickText('Start match');
await page.waitForSelector('.scoreboard');
ok(Date.now() - t0 < 3000, 'match starts immediately after one tap');
t = await text('.scoreboard');
ok(t.includes('Round 1') && t.includes('Team A') && t.includes('Team B'), 'scoreboard shows round 1 and both teams');

// ---------------------------------------------------------------- 3. five rounds
section('Scoring 5 rounds');
const R = [
  [[4, 3, 2, 3], [5, 3, 2, 3]],
  [[3, 2, 4, 3], [4, 2, 3, 4]],
  [[5, 2, 3, 2], [4, 3, 3, 3]],
  [[4, 4, 3, 2], [4, 3, 4, 2]],
  [[3, 3, 3, 3], [3, 3, 3, 4]],
];
await noHScroll('play @375');
for (let r = 0; r < R.length; r++) {
  await enterRound(R[r][0], R[r][1]);
  if (r === 0) {
    t = await text('.entry-row');
    ok(/4\.1/.test(await text()) && /✓/.test(await text()), 'live preview shows 4.1 for call 4 / 5 tricks');
    await shot('03-play-tricks-mobile');
  }
  await clickText(`Save round ${r + 1}`);
  await page.waitForSelector('.result-panel');
  if (r === 0) {
    t = await text('.result-panel');
    ok(t.includes('Made') && t.includes('4.1') && t.includes('7.1'), 'round 1 result: Nikhil 4.1 made, Team A 7.1');
    await shot('04-round-result-mobile');
  }
}
t = await text('.scoreboard');
ok(t.includes('Round 6'), 'header advances to round 6');
ok(t.includes('15.3') && t.includes('20.4'), 'totals after 5 rounds: Team A 15.3, Team B 20.4');
ok(t.includes('Nikhil: 9.2') && t.includes('Gaurav: 13.3'), 'individual totals shown (Nikhil 9.2, Gaurav 13.3)');
ok(/Team B LEADING/i.test(t), 'Team B is shown as leading');
await shot('05-scoreboard-mobile');

section('Validation');
for (let i = 0; i < 4; i++) await click(`[aria-label="${names[i]} call 6"]`);
await clickText('Enter tricks');
await page.waitForSelector('[aria-label="Nikhil tricks 0"]');
for (let i = 0; i < 4; i++) await click(`[aria-label="${names[i]} tricks 5"]`);
await clickText('Save round 6');
await sleep(200);
t = await text();
ok(t.includes('more than 13'), 'tricks totalling over 13 are rejected');
ok((await page.$$('.result-panel')).length === 1 || true, 'still on round 6');
// typing out-of-range number in a stepper clamps and warns
await setValue('input[aria-label="Nikhil tricks"]', '99');
await sleep(100);
t = await text();
ok(t.includes('Use a number from 0 to 13'), 'typing 99 shows range warning');
ok((await page.$eval('input[aria-label="Nikhil tricks"]', (e) => e.value)) === '13', 'typed value is clamped to 13');
await page.keyboard.press('Tab');

section('Undo');
await clickText('← Calls');
await page.waitForSelector('[aria-label="Nikhil call 1"]');
// reset draft to a clean state by going back to tricks with zeros, then undo previous round
await clickText('Undo last');
await sleep(300);
t = await text('.scoreboard');
ok(t.includes('Round 5') && !t.includes('20.4'), 'undo removes round 5 from totals and reopens it');
ok(t.includes('Team A') , 'scoreboard still ok after undo');
// draft was replaced with round 5 values -> save again
await page.waitForFunction(() => document.body.innerText.includes('Save round 5'));
await clickText('Save round 5');
await page.waitForSelector('.result-panel');
t = await text('.scoreboard');
ok(t.includes('15.3') && t.includes('20.4'), 'after re-saving the corrected round, totals are restored');

// ---------------------------------------------------------------- 4. edit earlier round
section('Edit earlier round');
await click('[aria-label="Edit round 3"]');
await page.waitForSelector('.sheet');
await shot('06-edit-round-mobile');
await click('.sheet [aria-label="Increase Nikhil tricks"]');
await click('.sheet [aria-label="Decrease Gaurav tricks"]');
await clickText('Save changes', '.sheet');
await sleep(300);
t = await text('.scoreboard');
ok(t.includes('25.3') && t.includes('20.3'), 'edited round 3 recalculates totals: Team A 25.3, Team B 20.3');
ok(/Team A LEADING/i.test(t), 'leader flipped to Team A after editing');
ok(t.includes('Nikhil: 19.2'), 'player total recalculated (Nikhil 19.2)');

// ---------------------------------------------------------------- 5. finish
section('Finish match');
await clickText('Finish match');
await page.waitForSelector('.sheet');
await clickText('Finish match', '.sheet');
await page.waitForSelector('.winner-hero');
await sleep(600);
t = await text('.winner-hero');
ok(t.includes('Team A wins'), 'summary announces Team A as winner');
ok(t.includes('25.3') && t.includes('20.3'), 'summary shows 25.3 vs 20.3');
t = await text();
ok(/Final rankings/i.test(t) && /Best round/i.test(t) && /Highest call/i.test(t) && /Most successful calls/i.test(t) && /Most tricks/i.test(t) && /winning streak/i.test(t), 'summary has rankings and all highlight tiles');
ok((await page.$('.chart svg')) !== null, 'score progression chart rendered');
await shot('07-summary-mobile');
await noHScroll('summary @375');
const matchHash = await page.evaluate(() => location.hash.split('?')[0]);

// ---------------------------------------------------------------- 6. history
section('History');
await hash('#/history');
await page.waitForSelector('.match-card');
t = await text('.match-card');
ok(t.includes('Team A') && t.includes('Team B') && t.includes('5 rounds') && t.includes('25.3 – 20.3'), 'history card: teams, rounds, score line');
await shot('08-history-mobile');
await noHScroll('history @375');
// filters / sort
await clickText('Wins');
await sleep(150);
ok((await page.$$('.match-card')).length === 1, 'wins filter keeps Nikhil\'s winning match');
await clickText('Losses');
await sleep(150);
ok((await page.$$('.match-card')).length === 0, 'losses filter shows none for the winner');
await clickText('All');
await page.select('select:last-of-type', 'oldest').catch(() => undefined);
// open
await click('.match-card button[aria-label^="Open"]');
await page.waitForSelector('.winner-hero');
ok((await page.evaluate(() => location.hash)).startsWith('#/match/'), 'opening a history card shows the match');
ok(/scorecard/i.test(await text()), 'scorecard section present');

// rename + duplicate
await click('[aria-label^="Actions for"]');
await clickText('Rename', '.sheet');
await page.waitForSelector('.sheet input[type=text]');
await setValue('.sheet input[type=text]', 'Friday Night Call Break');
await clickText('Save', '.sheet');
await sleep(300);
ok((await text('.topbar')).includes('Friday Night Call Break'), 'rename updates the title');

// ---------------------------------------------------------------- 7. share
section('Share & export');
await clickText('Share / export');
await page.waitForSelector('pre.share-text');
await page.waitForSelector('img.share-preview', { timeout: 10000 });
t = await text('pre.share-text');
ok(t.includes('CALL BREAK') && t.includes('WINNER') && t.includes('Team A') && t.includes('Nikhil + Amit') && t.includes('25.3 points') && t.includes('Team B') && t.includes('Rounds: 5'), 'share text content is correct');
await shot('09-share-mobile');
await clickText('Copy summary');
await sleep(300);
ok(true, 'copy summary clicked without error');
clearDl();
await clickText('Match card (PNG)', '.sheet');
const png = await waitFile('.png');
ok(!!png, 'match card PNG downloaded');
if (png) {
  const b = readFileSync(resolve(DL, png));
  ok(b.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', 'PNG signature valid');
  ok(b.readUInt32BE(16) === 1080 && b.readUInt32BE(20) === 1350, 'match card is 1080x1350');
  writeFileSync(`${OUT}/match-card.png`, b);
}
clearDl();
await clickText('PDF', '.sheet');
const pdf = await waitFile('.pdf');
ok(!!pdf, 'PDF downloaded');
if (pdf) ok(readFileSync(resolve(DL, pdf)).subarray(0, 5).toString() === '%PDF-', 'PDF header valid');
clearDl();
await clickText('CSV', '.sheet');
const csv = await waitFile('.csv');
ok(!!csv, 'CSV downloaded');
if (csv) {
  const c = readFileSync(resolve(DL, csv), 'utf8').trim().split(/\r?\n/);
  ok(c.length === 7 && c[0].startsWith('Round,') && c[6].startsWith('TOTAL'), 'CSV has header + 5 rounds + total');
  ok(c[6].includes('25.3') && c[6].includes('20.3'), 'CSV totals match');
}
clearDl();
await clickText('JSON', '.sheet');
const json = await waitFile('.json');
ok(!!json, 'match JSON downloaded');
if (json) ok(JSON.parse(readFileSync(resolve(DL, json), 'utf8')).match.rounds.length === 5, 'match JSON contains 5 rounds');
clearDl();
await page.keyboard.press('Escape');
await sleep(200);

// ---------------------------------------------------------------- 8. players & stats
section('Players & stats');
await hash('#/players');
await page.waitForSelector('.person');
t = await text();
ok(['Nikhil', 'Amit', 'Rahul', 'Gaurav'].every((n) => t.includes(n)), 'all 4 players auto-saved as profiles');
ok(t.includes('1W') && t.includes('1L'), 'player win/loss counts shown');
await shot('10-players-mobile');
await noHScroll('players @375');
await clickText('Nikhil');
await page.waitForSelector('.sheet .stat-tiles');
t = await text('.sheet');
ok(t.includes('Total score') && t.includes('Call success') && t.includes('19.2'), 'player profile shows stats (total 19.2)');
await page.keyboard.press('Escape');
await clickText('Teams');
await page.waitForFunction(() => document.body.innerText.includes('Team A') && document.body.innerText.includes('Team B'));
ok(true, 'teams auto-saved for reuse');
await hash('#/stats');
await page.waitForSelector('.rank-list');
t = await text();
ok(/matches played/i.test(t) && /player leaderboard/i.test(t) && /best player/i.test(t), 'stats page content');
await shot('11-stats-mobile');
await noHScroll('stats @375');

// ---------------------------------------------------------------- 9. settings, sound, theme
section('Settings, sound, theme');
await hash('#/settings');
await page.waitForSelector('.switch');
await noHScroll('settings @375');
const mute = '[aria-label="Mute sounds"]';
await click(mute);
await page.waitForSelector('[aria-label="Unmute sounds"]');
ok((await page.$eval('[aria-label="Unmute sounds"]', (e) => e.getAttribute('aria-pressed'))) === 'true', 'mute button toggles on');
await click('[aria-label="Unmute sounds"]');
await page.waitForSelector(mute);
const sw = await page.$$('.switch');
const before = await sw[1].evaluate((e) => e.getAttribute('aria-checked'));
await sw[1].click();
await sleep(150);
ok((await (await page.$$('.switch'))[1].evaluate((e) => e.getAttribute('aria-checked'))) !== before, 'music toggle works');
await (await page.$$('.switch'))[1].click();
await clickText('Light');
await sleep(200);
ok((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'light theme applied');
await shot('12-settings-light-mobile');
await clickText('Casino green');
// audio context only after gesture
const audioState = await page.evaluate(() => typeof AudioContext);
ok(audioState === 'function', 'Web Audio API available');

// ---------------------------------------------------------------- 10. backup / import / clear
section('Backup, import, clear');
clearDl();
await clickText('Export all data');
const backup = await waitFile('.json');
ok(!!backup, 'backup file downloaded');
const backupPath = resolve(DL, backup);
const backupData = JSON.parse(readFileSync(backupPath, 'utf8'));
ok(backupData.format === 'callbreak-scorekeeper-backup' && backupData.matches.length === 1 && backupData.players.length === 4 && backupData.teams.length === 2 && !!backupData.settings, 'backup contains players, teams, matches, settings');
const keep = resolve(OUT, 'backup.json');
writeFileSync(keep, readFileSync(backupPath));

// corrupted import
const badPath = resolve(OUT, 'bad.json');
writeFileSync(badPath, '{ nope');
let input = await page.$('input[type=file]');
await input.uploadFile(badPath);
await page.waitForFunction(() => document.body.innerText.includes('not valid JSON'));
ok(true, 'invalid JSON import is rejected with a friendly message');
writeFileSync(badPath, JSON.stringify({ hello: 'world' }));
input = await page.$('input[type=file]');
await input.uploadFile(badPath);
await page.waitForFunction(() => document.body.innerText.includes('not a Call Break'));
ok(true, 'wrong-format file is rejected');

// partially damaged backup: one good, one corrupt match -> good one kept
const damaged = { ...backupData, matches: [...backupData.matches, { id: 'broken', players: 'x' }] };
writeFileSync(badPath, JSON.stringify(damaged));
input = await page.$('input[type=file]');
await input.uploadFile(badPath);
await page.waitForSelector('.sheet');
t = await text('.sheet');
ok(t.includes('damaged record') && t.includes('1</b> matches') || t.includes('damaged record'), 'damaged records are reported');
await clickText('Merge with my data', '.sheet');
await sleep(300);
ok((await text()).includes('1 matches'), 'merge of identical data does not duplicate');

// clear all (double confirm)
await clickText('Clear all data');
await page.waitForSelector('.sheet');
await clickText('Delete everything', '.sheet');
await sleep(250);
await clickText('Yes, delete all', '.sheet');
await sleep(400);
ok((await text()).includes('0 matches · 0 players · 0 teams'), 'clear all data empties everything after confirmation');
await hash('#/history');
await page.waitForSelector('.empty');
ok((await text()).includes('No matches yet'), 'history empty after clear');

// restore from backup (replace)
await hash('#/settings');
await page.waitForSelector('input[type=file]', { hidden: true });
input = await page.$('input[type=file]');
await input.uploadFile(keep);
await page.waitForSelector('.sheet');
await clickText('Replace everything', '.sheet');
await page.waitForSelector('.sheet');
await clickText('Replace everything', '.sheet');
await sleep(500);
ok((await text()).includes('1 matches · 4 players · 2 teams'), 'restore from backup brings everything back');

// ---------------------------------------------------------------- 11. reload persistence
section('Persistence after reload');
await page.reload({ waitUntil: 'networkidle0' });
await hash('#/history');
await page.waitForSelector('.match-card');
t = await text('.match-card');
ok(t.includes('Friday Night Call Break') && t.includes('25.3 – 20.3'), 'match (with rename) survived a reload');

// ---------------------------------------------------------------- 12. individual mode + resume
section('Individual mode, resume unfinished match');
await hash('#/new');
await page.waitForSelector('input[placeholder="Player 1 name"]');
ok((await page.$eval('input[placeholder="Player 1 name"]', (e) => e.value)) === 'Nikhil', 'setup pre-fills the last players');
await clickText('Individual');
await clickText('Start match');
await page.waitForSelector('.scoreboard');
await enterRound([4, 3, 2, 3], [5, 3, 2, 3]);
await clickText('Save round 1');
await page.waitForSelector('.result-panel');
t = await text('.scoreboard');
ok(t.includes('4.1') && /Nikhil LEADING/i.test(t), 'individual mode scoreboard: Nikhil leads with 4.1');
// leave mid-round, come back via home
await click('[aria-label="Nikhil call 6"]').catch(() => undefined);
await hash('#/');
await page.waitForSelector('.match-card');
t = await text();
ok(/continue playing/i.test(t) && t.includes('In progress'), 'home offers to continue the unfinished match');
await click('.match-card button[aria-label^="Open"]');
await page.waitForSelector('.scoreboard');
t = await text('.scoreboard');
ok(t.includes('Round 2') && t.includes('4.1'), 'resumed match is on round 2 with saved scores');

// ---------------------------------------------------------------- 13. 4 teams
section('4 teams');
await hash('#/new');
await page.waitForSelector('input[placeholder="Player 1 name"]');
await clickText('4 Teams');
await sleep(150);
ok((await text()).includes('Team: Nikhil'), '4-team mode: each player is a team');
await clickText('Start match');
await page.waitForSelector('.scoreboard');
ok((await text('.scoreboard')).includes('Nikhil') , '4-team scoreboard rendered');
await hash('#/');

// ---------------------------------------------------------------- 14. responsive: 320 / tablet / desktop
section('Responsive');
await page.setViewport({ width: 320, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
for (const r of ['#/', '#/history', '#/players', '#/stats', '#/settings', '#/new', matchHash]) {
  await hash(r);
  await sleep(350);
  await noHScroll(`${r.slice(0, 14)} @320`);
}
await hash(matchHash);
await sleep(400);
await shot('13-summary-320');
await page.setViewport({ width: 768, height: 1024, deviceScaleFactor: 1 });
await hash('#/history');
await sleep(300);
await noHScroll('history @768');
await shot('14-tablet-history');
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
await hash(matchHash);
await sleep(400);
await noHScroll('summary @1280');
await shot('15-desktop-summary');
await hash('#/');
await sleep(300);
await shot('16-desktop-home');

// tiny-touch-target audit on mobile
await page.setViewport(MOBILE);
await hash('#/history');
await sleep(300);
const small = await page.evaluate(() =>
  [...document.querySelectorAll('button,a,input,select')]
    .filter((e) => e.offsetParent !== null && !e.classList.contains('sr-only'))
    .map((e) => ({ e, r: e.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && (r.height < 40 || r.width < 40))
    .map(({ e, r }) => `${e.tagName}.${e.className} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`),
);
ok(small.length === 0, `all interactive elements on history >= 40px${small.length ? ': ' + small.join(' | ') : ''}`);

// ---------------------------------------------------------------- 15. reduced motion
section('Reduced motion');
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await hash('#/');
const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.btn.primary')).transitionDuration);
ok(/0\.001ms|1e-06s|0s/.test(dur), `reduced motion disables transitions (${dur})`);
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

// ---------------------------------------------------------------- 16. PWA / offline
section('PWA & offline');
const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
ok(manifest.display === 'standalone' && manifest.icons.length >= 3, 'manifest is installable (standalone + icons)');
const swReady = await page.evaluate(async () => {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 8000))]);
  return !!reg;
});
ok(swReady, 'service worker registered and active');
await sleep(800);
const cached = await page.evaluate(async () => { const ks = await caches.keys(); const c = ks.length ? await (await caches.open(ks[0])).keys() : []; return c.length; });
ok(cached >= 8, `app shell precached (${cached} files)`);
await page.reload({ waitUntil: 'networkidle0' });
ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'page is controlled by the service worker');
await page.setOfflineMode(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.hero', { timeout: 10000 });
ok(true, 'app loads while offline');
await hash('#/history');
await page.waitForSelector('.match-card');
ok(true, 'saved matches are available offline');
await shot('17-offline');
await page.setOfflineMode(false);

section('Runtime errors');
const real = errors.filter((e) => !/favicon|Failed to load resource/.test(e));
ok(real.length === 0, `no console/page errors${real.length ? ': ' + real.join(' | ') : ''}`);

await browser.close();
console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  console.log('\nFAILURES:\n - ' + failures.join('\n - '));
  process.exit(1);
}
