// Tiny Web Audio synth: no asset files, no licensing. The context starts on the first user gesture.
let ctx: AudioContext | undefined;

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0, slideTo = freq) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur);
  } catch {} // audio is optional
}

const note = (n: number) => 261.63 * 2 ** (n / 12); // C4 + n semitones

export const sfx = {
  pick: () => tone(note(12), 0.05, 'triangle', 0.08),
  eat: () => [0, 1, 2, 3].forEach((i) => tone(180 + (i % 2) * 40, 0.07, 'square', 0.06, i * 0.13)), // nom nom
  burp: () => tone(140, 0.35, 'sawtooth', 0.12, 0, 70),
  purr: () => tone(note(16), 0.18, 'sine', 0.1, 0, note(19)),
  ouch: () => tone(note(24), 0.22, 'square', 0.1, 0, note(12)),
  clean: () => [12, 16, 19].forEach((n, i) => tone(note(n), 0.12, 'triangle', 0.12, i * 0.07)),
  poop: () => tone(120, 0.15, 'sine', 0.2, 0, 60),
  key: () => [19, 24, 28, 31].forEach((n, i) => tone(note(n), 0.25, 'sine', 0.1, i * 0.09)), // sparkle
  chest: () => [0, 4, 7, 12, 16, 19].forEach((n, i) => tone(note(n + 12), 0.3, 'triangle', 0.1, i * 0.07)),
  wear: () => [12, 19, 24].forEach((n, i) => tone(note(n), 0.2, 'triangle', 0.12, i * 0.08)),
  no: () => tone(note(4), 0.18, 'sine', 0.1, 0, note(0)),
};
