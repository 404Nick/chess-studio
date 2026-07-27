import type { MoveNode } from '@/types';

/**
 * Move sound effects, synthesised with the Web Audio API rather than shipped as audio
 * files. This keeps the app fully self-contained (no external assets, no CDN) — the
 * same philosophy as the drawn piece sets and the bundled engine.
 */

export type SoundKind =
  | 'move'
  | 'capture'
  | 'castle'
  | 'check'
  | 'promote'
  | 'blunder'
  | 'gameEnd';

let context: AudioContext | null = null;

/** Lazily creates the shared AudioContext. Returns null when audio is unavailable. */
function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

/** A short amplitude-enveloped oscillator note. */
function tone(
  ctx: AudioContext,
  {
    freq,
    freqEnd,
    type = 'sine',
    start = 0,
    duration,
    peak,
  }: {
    freq: number;
    freqEnd?: number;
    type?: OscillatorType;
    start?: number;
    duration: number;
    peak: number;
  },
): void {
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** A short filtered-noise burst — used for the "thock" of a piece landing. */
function noise(
  ctx: AudioContext,
  { start = 0, duration, peak, cutoff = 2600 }: { start?: number; duration: number; peak: number; cutoff?: number },
): void {
  const t0 = ctx.currentTime + start;
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    // Decaying white noise.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = cutoff;
  filter.Q.value = 0.7;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

/**
 * Plays one sound effect. `volume` is 0–100; anything <= 0 is silent.
 * Safe to call from any user gesture — the AudioContext is resumed on demand.
 */
export function playSound(kind: SoundKind, volume = 70): void {
  if (volume <= 0) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();

  const v = Math.max(0, Math.min(1, volume / 100));

  switch (kind) {
    case 'move':
      noise(ctx, { duration: 0.05, peak: 0.12 * v, cutoff: 1900 });
      tone(ctx, { freq: 180, freqEnd: 140, type: 'triangle', duration: 0.06, peak: 0.14 * v });
      break;
    case 'capture':
      noise(ctx, { duration: 0.09, peak: 0.2 * v, cutoff: 2400 });
      tone(ctx, { freq: 150, freqEnd: 90, type: 'sawtooth', duration: 0.1, peak: 0.16 * v });
      break;
    case 'castle':
      noise(ctx, { duration: 0.05, peak: 0.12 * v, cutoff: 1700 });
      noise(ctx, { start: 0.09, duration: 0.05, peak: 0.12 * v, cutoff: 1700 });
      break;
    case 'check':
      tone(ctx, { freq: 660, type: 'sine', duration: 0.09, peak: 0.16 * v });
      tone(ctx, { freq: 990, type: 'sine', start: 0.08, duration: 0.12, peak: 0.16 * v });
      break;
    case 'promote':
      tone(ctx, { freq: 523, type: 'triangle', duration: 0.1, peak: 0.15 * v });
      tone(ctx, { freq: 659, type: 'triangle', start: 0.08, duration: 0.1, peak: 0.15 * v });
      tone(ctx, { freq: 784, type: 'triangle', start: 0.16, duration: 0.16, peak: 0.16 * v });
      break;
    case 'blunder':
      tone(ctx, { freq: 300, freqEnd: 110, type: 'sawtooth', duration: 0.34, peak: 0.2 * v });
      tone(ctx, { freq: 150, freqEnd: 70, type: 'square', duration: 0.34, peak: 0.08 * v });
      break;
    case 'gameEnd':
      // A soft major triad.
      tone(ctx, { freq: 523, type: 'sine', duration: 0.5, peak: 0.14 * v });
      tone(ctx, { freq: 659, type: 'sine', duration: 0.5, peak: 0.12 * v });
      tone(ctx, { freq: 784, type: 'sine', duration: 0.55, peak: 0.12 * v });
      break;
    default:
      break;
  }
}

/**
 * Picks the right sound for a move that was just played and plays it.
 * `gameOver` takes priority so mate/stalemate resolves to the game-end chime.
 */
export function playMoveSound(node: MoveNode, opts: { volume?: number; gameOver?: boolean } = {}): void {
  const { volume = 70, gameOver = false } = opts;
  if (volume <= 0) return;

  if (gameOver) {
    playSound('gameEnd', volume);
    return;
  }
  if (node.isCheck) {
    playSound('check', volume);
    return;
  }
  if (node.promotion) {
    playSound('promote', volume);
    return;
  }
  if (node.san.startsWith('O-O')) {
    playSound('castle', volume);
    return;
  }
  playSound(node.captured ? 'capture' : 'move', volume);
}
