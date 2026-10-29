/**
 * Sound effects and ambient music, synthesised with the Web Audio API (no audio files, no copyright issues).
 * The AudioContext is only created/resumed from a user gesture (the first call to `play`/`startMusic`
 * always happens in a click handler), so nothing autoplays.
 */
export type Sfx = 'tap' | 'newRound' | 'success' | 'fail' | 'leader' | 'complete' | 'winner';

let ctx: AudioContext | null = null;
let sfxOn = true;
let musicOn = false;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let musicGain: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try { ctx = new Ctor(); } catch { return null; }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

interface Note { f: number; t: number; d: number; type?: OscillatorType; v?: number }

function tone(c: AudioContext, dest: AudioNode, n: Note, base: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  const start = base + n.t;
  const vol = n.v ?? 0.12;
  o.type = n.type ?? 'sine';
  o.frequency.setValueAtTime(n.f, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + n.d);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + n.d + 0.05);
}

const N = { C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, C6: 1046.5, A3: 220, E3: 164.81, F4: 349.23 };

const SOUNDS: Record<Sfx, Note[]> = {
  tap: [{ f: 660, t: 0, d: 0.05, type: 'triangle', v: 0.06 }],
  newRound: [{ f: N.E4, t: 0, d: 0.12, type: 'triangle' }, { f: N.A4, t: 0.09, d: 0.18, type: 'triangle' }],
  success: [{ f: N.C5, t: 0, d: 0.14 }, { f: N.E5, t: 0.09, d: 0.14 }, { f: N.G5, t: 0.18, d: 0.28 }],
  fail: [{ f: 220, t: 0, d: 0.16, type: 'sawtooth', v: 0.05 }, { f: 165, t: 0.12, d: 0.3, type: 'sawtooth', v: 0.05 }],
  leader: [{ f: N.G4, t: 0, d: 0.1, type: 'triangle' }, { f: N.C5, t: 0.08, d: 0.22, type: 'triangle' }],
  complete: [{ f: N.C5, t: 0, d: 0.16 }, { f: N.G4, t: 0.14, d: 0.16 }, { f: N.C5, t: 0.28, d: 0.4 }],
  winner: [
    { f: N.C5, t: 0, d: 0.16 }, { f: N.E5, t: 0.14, d: 0.16 }, { f: N.G5, t: 0.28, d: 0.16 },
    { f: N.C6, t: 0.42, d: 0.5 }, { f: N.E5, t: 0.42, d: 0.5, v: 0.07 }, { f: N.G5, t: 0.42, d: 0.5, v: 0.07 },
  ],
};

export function play(name: Sfx) {
  if (!sfxOn) return;
  const c = getCtx();
  if (!c) return;
  const base = c.currentTime + 0.01;
  for (const n of SOUNDS[name]) tone(c, c.destination, n, base);
}

/* Gentle looping pad: a slow I–vi–IV–V arpeggio at low volume. */
const PROGRESSION = [
  [N.C4, N.E4, N.G4],
  [N.A3, N.C4, N.E4],
  [N.F4 / 2, N.A3, N.C4],
  [N.G4 / 2, N.D4, N.G4],
];

function scheduleBar(i: number) {
  const c = ctx;
  if (!c || !musicGain || !musicOn) return;
  const chord = PROGRESSION[i % PROGRESSION.length];
  const base = c.currentTime + 0.05;
  chord.forEach((f, k) => tone(c, musicGain!, { f, t: k * 0.55, d: 1.6, type: 'sine', v: 0.5 }, base));
}

export function startMusic() {
  musicOn = true;
  const c = getCtx();
  if (!c || musicTimer) return;
  musicGain = c.createGain();
  musicGain.gain.value = 0.07;
  musicGain.connect(c.destination);
  let bar = 0;
  scheduleBar(bar++);
  musicTimer = setInterval(() => scheduleBar(bar++), 2200);
}

export function stopMusic() {
  musicOn = false;
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  if (musicGain) {
    try { musicGain.disconnect(); } catch { /* already disconnected */ }
    musicGain = null;
  }
}

let interacted = false;
let musicWanted = false;

/** Apply settings. Music only actually starts once the user has interacted with the page (autoplay policy + our own rule). */
export function configureAudio(opts: { soundEffects: boolean; music: boolean }) {
  sfxOn = opts.soundEffects;
  musicWanted = opts.music;
  if (!musicWanted) stopMusic();
  else if (interacted) startMusic();
}

/** Call from a real user gesture (pointerdown/keydown). Creates/resumes the AudioContext and starts music if enabled. */
export function unlockAudio() {
  interacted = true;
  getCtx();
  if (musicWanted) startMusic();
}
