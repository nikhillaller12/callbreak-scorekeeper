# ♠ Call Break Scorekeeper ♥

A fast, offline-first scorekeeper for **Call Break** played with physical cards. Enter each player's call and
tricks won – the app does the scoring, keeps the leaderboard, history and statistics, and makes a shareable
result card. No account, no backend, no ads. Installable as a phone app (PWA).

- 4 players · Individual, 2-team and 4-team modes · unlimited rounds
- Big touch controls (tap 0–13, ± steppers, or type) – start a match in 2 taps
- Live scoreboard with leader highlight, per-round results and celebration
- Undo, edit or delete any earlier round – totals, winner and stats recalculate automatically
- Match summary, history (filter/sort/rename/duplicate/delete), player & team profiles, statistics
- Share as text, PNG card, scorecard image, PDF, CSV or JSON (native share sheet when available)
- Sound effects and optional music generated with the Web Audio API (no audio files, no autoplay)
- Dark "casino" theme and light theme, reduced-motion support, keyboard and screen-reader friendly
- Works offline after the first load; data stored on your device (IndexedDB)

## Contents

1. [Quick start](#quick-start) · 2. [Scripts](#scripts) · 3. [Deploy for free](#deploy-for-free) · 4. [Updating](#updating-the-app)
5. [Architecture](#architecture) · 6. [Data & backup](#data-storage-and-backup) · 7. [Scoring rules](#scoring-rules)
8. [Testing](#testing) · 9. [Demo data](#demo-data) · 10. [Known limitations](#known-limitations) · 11. [Ideas](#future-ideas)

## Quick start

Requirements: Node.js 20+ (tested on 22 and 26) and npm.

```bash
npm install
npm run dev        # http://localhost:5173 with hot reload
```

Production build and local preview (this is also what the service worker/offline mode needs – the
service worker is only registered in production builds):

```bash
npm run build      # type-checks, then writes the static site to dist/
npm run preview    # http://localhost:4173
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc --noEmit` + production build + service worker generation into `dist/` |
| `npm run preview` | Serve `dist/` on port 4173 |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Browser journey test in real Chrome against `npm run preview` (see [Testing](#testing)) |
| `npm run icons` | Re-render PNG icons from `public/icons/icon.svg` (needs Chrome) |

## Deploy for free

The build output (`dist/`) is a plain static site that uses relative paths (`base: './'`) and hash routing
(`#/history`), so it works on any host and under any sub-path with no server configuration.

### Option A – GitHub Pages (automatic, included)

1. Create a repository on GitHub and push this project:
   ```bash
   git init && git add . && git commit -m "Call Break Scorekeeper"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. In the repo go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs the tests, builds, and
   publishes on every push to `main`. Your app appears at `https://<you>.github.io/<repo>/`.

### Option B – Cloudflare Pages

Dashboard → *Workers & Pages* → *Create* → *Pages* → connect the repo. Build command `npm run build`,
output directory `dist`. (Or drag-and-drop the `dist` folder after `npm run build`.)

### Option C – Netlify

*Add new site → Import from Git*, build command `npm run build`, publish directory `dist`.
Or drag-and-drop the `dist` folder onto <https://app.netlify.com/drop>.

### Option D – Vercel

*Add New → Project*, import the repo. Framework preset **Vite**; defaults (`npm run build`, `dist`) are correct.

## Updating the app

1. Change the code, run `npm test` and `npm run build`.
2. Commit and push to `main` – GitHub Actions redeploys automatically (other hosts redeploy on push too).
3. Users get the update next time they open the app online: each build produces a new service-worker
   cache version, the old cache is deleted on activation, and the new version takes over on the following
   launch. **Saved matches are never touched by updates** – they live in IndexedDB, not in the cache.

## Architecture

```
src/
  domain/      Pure TypeScript game logic – no React, no browser APIs (fully unit-tested)
    types.ts     data model (Player, Team, Match, Round, Settings…)
    scoring.ts   calculateScore() + SCORING_RULES registry  ← the ONLY place score maths lives
    match.ts     units (player/team), totals, standings, winner, add/edit/delete/undo rounds, validation
    stats.ts     player/team/overall statistics and per-match summary (always derived from rounds)
    sanitize.ts  defensive parsing of stored/imported data, backup format, merge
    demo.ts      optional sample data (all records flagged demo: true)
  storage/     IndexedDB adapter + in-memory fallback, safe loading
  state/       tiny external store (useSyncExternalStore) + actions that write through to storage
  audio/       Web Audio synthesised effects and music
  share/       text/CSV/JSON builders, canvas match-card & scorecard renderer, dependency-free PDF writer
  ui/          React components, screens, hash router
scripts/       sw.template.js (service worker), make-icons.mjs, e2e.mjs
tests/         Vitest unit tests
```

Design rules that keep it reliable:

- **Derived, not stored.** Round scores, totals, rankings, the winner and every statistic are computed from
  the list of `{call, tricks}` entries. Editing a round therefore cannot leave stale totals. (`winnerIds` is
  cached on the match for convenience but is recomputed on every mutation and on load – a stored value is never trusted.)
- **Scoring is pluggable.** `calculateScore(call, tricks, ruleId)` delegates to a rule in `SCORING_RULES`.
  To add a rule, add one object there; the setup screen and settings list it automatically.
- **Exact arithmetic.** Scores are summed through integer tenths, so `0.1 + 0.2` style float drift can't appear.
- **Matches snapshot their players/teams**, so history stays correct even if a profile is later edited or deleted.
- **Every record from storage/imports is sanitised**; one damaged record is skipped (and reported) without
  affecting the rest.

## Data storage and backup

- Everything is stored **on the device** in IndexedDB (`callbreak-scorekeeper` database: `players`, `teams`,
  `matches`, `settings`). Nothing is sent anywhere. Photos are downscaled to 160 px and stored inline.
- If IndexedDB is unavailable (some private modes) the app keeps working in memory and warns that data
  will not survive closing the tab.
- Clearing browser data / uninstalling the PWA erases the data → **export a backup** from *Settings → Export all data*.
- **Import** (Settings → Import data) validates the file first, tells you how many records were skipped as
  damaged, then lets you choose:
  - **Merge** (safe): adds records you don't have and updates ones that are older here. Nothing is deleted.
  - **Replace everything**: asks for a second confirmation.
- *Clear all data* requires two confirmations. Damaged records found at startup are reported on the home screen.
- Per-match exports (JSON/CSV/PDF/PNG) are in the match's *Share / export* sheet.

## Scoring rules

Default (**Standard**): if `tricks ≥ call` then `score = call + (tricks − call) × 0.1`, otherwise `score = −call`.

| Call | Tricks | Score |
| --- | --- | --- |
| 4 | 4 | 4.0 |
| 4 | 5 | 4.1 |
| 4 | 6 | 4.2 |
| 4 | 3 | −4.0 |
| 0 | 0 | 0.0 |

Team score = sum of its players' scores for that round. A **Whole points** variant (extra tricks ignored) is
included as an example of a second rule. Calls and tricks must be whole numbers 0–13; the four players' tricks
in a round may not exceed 13 (optionally, Settings can require exactly 13).

## Testing

```bash
npm test          # 66 unit tests
npm run typecheck
```

Unit tests cover: score calculation (made / failed / extra tricks / zero / no float drift / invalid input), team
scoring in all modes, totals, ties and winners, round add/edit/delete/undo and recalculation, validation,
statistics (including recalculation after edits), summaries and streaks, sanitising corrupted data, backup
round-trip and merge, storage adapters (IndexedDB via `fake-indexeddb`, and memory), text/CSV/JSON exports
and the PDF writer.

**Browser journey test** (`npm run e2e`) drives real Chrome (path auto-detected; set `CHROME_PATH` otherwise)
against the production build. Start the preview first:

```bash
npm run build && npm run preview &   # terminal 1 (or background)
npm run e2e                           # terminal 2
```

It plays the full flow on a 375 px phone viewport – new 2-team match → 5 rounds → verifies calculations →
validation → undo → edits an earlier round and checks recalculated totals/leader → finishes → verifies the
winner → history (filters, open, rename) → share text, PNG, PDF, CSV, JSON downloads → players and stats →
settings (mute, music, theme) → export all / reject bad imports / merge / clear / restore → reload persistence →
individual and 4-team modes → resume unfinished match → 320 / 375 / 768 / 1280 px horizontal-overflow checks →
touch-target sizes → reduced motion → manifest, service worker, offline reload – and saves screenshots to
`e2e-output/`. It currently passes 95/95 checks.

## Demo data

Sample players (Nikhil, Amit, Rahul, Gaurav), two teams and four matches (one unfinished) can be added from
the home screen (when empty) or *Settings → Demo data*. Everything is flagged `demo: true`;
*Settings → Remove demo data* deletes only those records. To ship without demo functionality, delete
`src/domain/demo.ts` and the few `loadDemo`/`removeDemo` references (`src/state/store.ts`, Home and Settings screens).

## Known limitations

- Fixed at 4 players per match (the standard Call Break table). Round "13" is only a guide – rounds are unlimited.
- Data is per device/browser; there is no cloud sync. Use export/import to move data between devices.
- Native sharing of image files depends on the browser (Web Share Level 2); otherwise the app copies the text
  summary and you can download the PNG/PDF and attach it manually.
- Background music is a simple synthesised loop; browsers require a tap before any sound can play, so the first
  tap on a fresh page load is what unlocks audio.
- The PDF contains the match card and scorecard as images (not selectable text).
- iOS may evict PWA storage after long inactivity – keep periodic backups.
- The service worker only exists in production builds, so offline behaviour can't be tested with `npm run dev`.

## Future ideas

- Optional bid-limit rules (e.g. minimum call of 1, "all-or-nothing" 8+ calls) as extra `SCORING_RULES`.
- Variable player counts and a "dealer" indicator.
- Optional encrypted cloud/Drive backup, QR-code hand-off of a match between phones.
- Per-player trend charts and head-to-head records.
- Localisation (Hindi/Nepali/…), more avatar packs, custom sound themes.

## License

MIT
