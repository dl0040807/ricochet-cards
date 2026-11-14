// 12 sample diary days so a first-time visitor has memories to open.
// Real photos: put public/samples/01.jpg … 12.jpg (+ 01-depth.png … from `npm run sample-depth`) and they replace the drawn scenes.
export type Sample = { ago: number; mood: number; memo: string; sky: [string, string]; hills: string[]; sun: string };
export const SAMPLES: Sample[] = [ // the 12 days before today; moods: 0 Joy 1 Excited 2 Calm 3 Sad 4 Tired
  { ago: 12, mood: 1, memo: 'First club meeting, so nervous.', sky: ['#7ec8ff', '#d9f1ff'], hills: ['#e07a5f', '#c2573e', '#7d3b2a'], sun: '#ffffff' },
  { ago: 11, mood: 2, memo: 'Coffee on a campus bench.', sky: ['#9ad1ff', '#e5f4ff'], hills: ['#9ccf8a', '#5fa463', '#2f6b45'], sun: '#fffbe6' },
  { ago: 10, mood: 3, memo: 'Rainy day, a little blue.', sky: ['#6b7787', '#a9b3bf'], hills: ['#55606e', '#3d4652', '#262d36'], sun: '#cfd6de' },
  { ago: 9, mood: 4, memo: 'Racing a project deadline.', sky: ['#9a8c98', '#c9ada7'], hills: ['#8a5fbf', '#5c4a74', '#3a2d44'], sun: '#f2e9e4' },
  { ago: 8, mood: 0, memo: 'Scored a goal at soccer!', sky: ['#5fb6ff', '#c8ecff'], hills: ['#6cc36a', '#3e9b4f', '#1f6b3a'], sun: '#fffbe0' },
  { ago: 7, mood: 1, memo: 'The sunset was so pretty.', sky: ['#ff9a62', '#ffd9a0'], hills: ['#b5577a', '#7a3b6b', '#3f2350'], sun: '#fff1c1' },
  { ago: 6, mood: 2, memo: 'Got the window seat at the library.', sky: ['#cde7d8', '#f1faf4'], hills: ['#a3c4a8', '#6d9f7a', '#3e6b4f'], sun: '#ffffff' },
  { ago: 5, mood: 2, memo: 'Lay on the grass and watched the sky.', sky: ['#61c3e8', '#d4f3ff'], hills: ['#9ccf8a', '#6fae5f', '#3f7a3a'], sun: '#ffffff' },
  { ago: 4, mood: 4, memo: 'Studied all night for the exam.', sky: ['#2b2d6e', '#6a4c93'], hills: ['#4f3a8a', '#352a66', '#1d1b45'], sun: '#ffe8a3' },
  { ago: 3, mood: 0, memo: 'Had a delicious lunch.', sky: ['#f6c28b', '#fff0d6'], hills: ['#f4a259', '#d1603d', '#8c3b22'], sun: '#fff7e6' },
  { ago: 2, mood: 1, memo: 'First autumn leaves outside my dorm.', sky: ['#9ad1ff', '#e5f4ff'], hills: ['#f4a259', '#d1603d', '#8c3b22'], sun: '#fffbe6' },
  { ago: 1, mood: 2, memo: 'A quiet walk.', sky: ['#f7d6e0', '#fdf0f4'], hills: ['#b8c5d6', '#8fa3bf', '#5c7392'], sun: '#ffffff' },
];

/** A drawn layered landscape and its matching depth map (bright = near). */
export function drawSample(s: Sample, w = 768, h = 576) {
  const photo = new OffscreenCanvas(w, h), depth = new OffscreenCanvas(w, h);
  const p = photo.getContext('2d')!, d = depth.getContext('2d')!;
  const sky = p.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, s.sky[0]); sky.addColorStop(1, s.sky[1]);
  p.fillStyle = sky; p.fillRect(0, 0, w, h);
  d.fillStyle = '#000'; d.fillRect(0, 0, w, h);
  p.fillStyle = s.sun; p.beginPath(); p.arc(w * 0.72, h * 0.26, h * 0.09, 0, 7); p.fill();
  let seed = s.ago * 97;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  s.hills.forEach((col, i) => {
    const top = h * (0.42 + i * 0.16), amp = h * (0.1 - i * 0.02), ph = rnd() * 6, fr = 1.5 + rnd() * 2;
    const ridge = (g: OffscreenCanvasRenderingContext2D) => {
      g.beginPath(); g.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, top - Math.sin(x / w * Math.PI * fr + ph) * amp - Math.sin(x / w * 17 + ph) * amp * 0.15);
      g.lineTo(w, h); g.closePath();
    };
    p.fillStyle = col; ridge(p); p.fill();
    const near = 0.25 + i * 0.25, dg = d.createLinearGradient(0, top - amp, 0, h); // ground comes toward you at the bottom
    dg.addColorStop(0, `rgb(${[near * 255, near * 255, near * 255]})`);
    dg.addColorStop(1, `rgb(${[(near + 0.2) * 255, (near + 0.2) * 255, (near + 0.2) * 255].map((v) => Math.min(255, v))})`);
    d.fillStyle = dg; ridge(d); d.fill();
  });
  // a lone tree in front, the nearest thing in the picture
  const tx = w * (0.15 + rnd() * 0.15), ty = h * 0.98;
  for (const [g, trunk, crown] of [[p, '#5b3a29', s.hills[2]], [d, '#f0f0f0', '#ffffff']] as const) {
    g.fillStyle = trunk; g.fillRect(tx - 8, ty - h * 0.32, 16, h * 0.32);
    g.fillStyle = crown; g.beginPath(); g.ellipse(tx, ty - h * 0.38, w * 0.07, h * 0.13, 0, 0, 7); g.fill();
  }
  return { photo, depth };
}
