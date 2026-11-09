// Tiny Web Audio synth: no asset files, no licensing. The context starts on the first user gesture.
let ctx: AudioContext | undefined;

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur);
  } catch {} // audio is optional
}

const note = (semitones: number) => 261.63 * 2 ** (semitones / 12); // C4 + n semitones

export const sfx = {
  grab: () => tone(note(0), 0.06, 'triangle', 0.08),
  bounce: (rank: number) => tone(note(rank * 2), 0.18, 'sine', 0.18), // rises with each rank
  ace: () => [0, 4, 7, 12, 16].forEach((n, i) => tone(note(n + 12), 0.25, 'sawtooth', 0.1, i * 0.06)),
  score: (points: number) => {
    tone(note(12), 0.15, 'triangle', 0.2);
    tone(note(points >= 10 ? 19 : 16), 0.3, 'triangle', 0.2, 0.1);
  },
  miss: () => tone(90, 0.25, 'sine', 0.25), // soft thud
  over: () => [12, 9, 5, 0].forEach((n, i) => tone(note(n), 0.3, 'triangle', 0.15, i * 0.12)),
};
