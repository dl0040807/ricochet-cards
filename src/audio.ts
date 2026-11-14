// Tiny Web Audio synth: no asset files, no licensing. The context starts on the first user gesture.
let ctx: AudioContext | undefined;
const ac = () => { ctx ??= new AudioContext(); if (ctx.state === 'suspended') void ctx.resume(); return ctx; };

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0, slideTo = freq) {
  try {
    const c = ac(), t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur);
  } catch {} // audio is optional
}

const note = (n: number) => 261.63 * 2 ** (n / 12); // C4 + n semitones

export const sfx = {
  tap: () => tone(note(19), 0.04, 'triangle', 0.06),
  pick: () => tone(note(12), 0.06, 'triangle', 0.08),
  page: () => tone(note(7), 0.12, 'sine', 0.08, 0, note(14)),
  open: () => [0, 4, 7, 12].forEach((n, i) => tone(note(n + 12), 0.5, 'sine', 0.07, i * 0.06)),
  close: () => tone(note(12), 0.3, 'sine', 0.08, 0, note(0)),
  drop: () => tone(note(16), 0.2, 'sine', 0.1, 0, note(24)),
  done: () => [12, 16, 19, 24].forEach((n, i) => tone(note(n), 0.35, 'triangle', 0.09, i * 0.09)),
  no: () => tone(note(4), 0.18, 'sine', 0.08, 0, note(0)),
};

// soft mood pad while a memory is open (major for good days, minor for low ones)
const CHORDS = [[0, 4, 7, 11], [0, 4, 7, 9], [0, 5, 9, 12], [0, 3, 7, 10], [0, 3, 6, 10]];
let pad: { g: GainNode; o: OscillatorNode[] } | null = null;
export function padOn(mood: number) {
  padOff();
  try {
    const c = ac(), g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.035, c.currentTime + 1.5);
    g.connect(c.destination);
    const o = (CHORDS[mood] ?? CHORDS[2]).map((n) => {
      const x = c.createOscillator();
      x.frequency.value = note(n - 12);
      x.connect(g);
      x.start();
      return x;
    });
    pad = { g, o };
  } catch {}
}
export function padOff() {
  if (!pad || !ctx) return;
  const { g, o } = pad, t = ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
  o.forEach((x) => x.stop(t + 0.9));
  pad = null;
}
