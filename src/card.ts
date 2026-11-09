import { BoxGeometry, CanvasTexture, Mesh, MeshBasicMaterial } from '@iwsdk/core';
// Unlit materials on purpose: the AR scene has no lights, lit materials render near-black.

export const CARD_W = 0.06, CARD_H = 0.09, CARD_T = 0.006;
export const cardGeo = new BoxGeometry(CARD_W, CARD_H, CARD_T);

export const LABELS = ['2', '5', '8', '10', 'J', 'Q', 'K', 'A'];
const SUITS = [
  { ch: '♠', red: false },
  { ch: '♥', red: true },
  { ch: '♦', red: true },
  { ch: '♣', red: false },
];
const FONT = '"Georgia", "Times New Roman", serif';
const W = 256, H = 384;

// pip positions (fraction of the inner area) per number card, like a real deck
const L = 0.3, C = 0.5, R = 0.7;
const PIPS: Record<string, [number, number][]> = {
  '2': [[C, 0.22], [C, 0.78]],
  '5': [[L, 0.22], [R, 0.22], [C, 0.5], [L, 0.78], [R, 0.78]],
  '8': [[L, 0.22], [R, 0.22], [C, 0.36], [L, 0.5], [R, 0.5], [C, 0.64], [L, 0.78], [R, 0.78]],
  '10': [[L, 0.2], [R, 0.2], [C, 0.3], [L, 0.4], [R, 0.4], [L, 0.6], [R, 0.6], [C, 0.7], [L, 0.8], [R, 0.8]],
};

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function canvasTex() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  return { c, g: c.getContext('2d')!, tex: new CanvasTexture(c) };
}

/** Card back: deep blue with a diamond lattice and a gold frame. */
function backMaterial() {
  const { g, tex } = canvasTex();
  g.fillStyle = '#f4f1e8';
  g.fillRect(0, 0, W, H);
  roundRect(g, 14, 14, W - 28, H - 28, 16);
  g.fillStyle = '#1b2a6b';
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = '#c9a24a';
  g.globalAlpha = 0.55;
  g.lineWidth = 2;
  for (let i = -H; i < W + H; i += 28) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke();
    g.beginPath(); g.moveTo(i, H); g.lineTo(i + H, 0); g.stroke();
  }
  g.restore();
  roundRect(g, 24, 24, W - 48, H - 48, 12);
  g.strokeStyle = '#e6c872';
  g.lineWidth = 4;
  g.stroke();
  return new MeshBasicMaterial({ map: tex });
}

const edge = () => new MeshBasicMaterial({ color: 0xf4f1e8 });

/** A card that can be re-painted to a new rank while keeping its suit. */
export function makeCard(): { mesh: Mesh; paint: (rank: number) => void } {
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  const { g, tex } = canvasTex();
  const front = new MeshBasicMaterial({ map: tex });
  const e = edge();
  // BoxGeometry face order: +x, -x, +y, -y, +z (front), -z (back)
  const mesh = new Mesh(cardGeo, [e, e, e, e, front, backMaterial()]);

  const paint = (rank: number) => {
    const label = LABELS[Math.min(rank, 7)];
    const ace = rank >= 7;
    const ink = ace ? '#d58bff' : suit.red ? '#c8202f' : '#15151a';
    g.clearRect(0, 0, W, H);
    g.fillStyle = ace ? '#1a0630' : '#f8f5ec';
    g.fillRect(0, 0, W, H);
    roundRect(g, 10, 10, W - 20, H - 20, 18);
    g.strokeStyle = ace ? '#b05cff' : '#c9c4b4';
    g.lineWidth = ace ? 6 : 3;
    g.stroke();
    g.fillStyle = ink;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';

    // corner indices (top-left, and rotated 180 deg at bottom-right)
    const corner = () => {
      g.font = `bold ${label === '10' ? 44 : 52}px ${FONT}`;
      g.fillText(label, 44, 72);
      g.font = '40px sans-serif';
      g.fillText(suit.ch, 44, 114);
    };
    corner();
    g.save();
    g.translate(W, H);
    g.rotate(Math.PI);
    corner();
    g.restore();

    // centre art
    const ax = 70, ay = 60, aw = W - 140, ah = H - 120;
    if (PIPS[label]) {
      g.font = '54px sans-serif';
      g.textBaseline = 'middle';
      for (const [px, py] of PIPS[label]) {
        const x = ax + px * aw, y = ay + py * ah;
        g.save();
        g.translate(x, y);
        if (py > 0.5) g.rotate(Math.PI); // lower pips are upside down, as on a real card
        g.fillText(suit.ch, 0, 0);
        g.restore();
      }
    } else {
      g.textBaseline = 'middle';
      if (label === 'A') {
        g.font = '170px sans-serif';
        if (ace) { g.shadowColor = '#b05cff'; g.shadowBlur = 24; } // neon glow
        g.fillText(suit.ch, W / 2, H / 2 + 6);
        g.shadowBlur = 0;
      } else {
        // face cards: framed panel with the letter and suit
        roundRect(g, ax - 6, ay + 10, aw + 12, ah - 20, 10);
        g.strokeStyle = ink;
        g.lineWidth = 3;
        g.stroke();
        g.font = `bold 120px ${FONT}`;
        g.fillText(label, W / 2, H / 2 - 22);
        g.font = '70px sans-serif';
        g.fillText(suit.ch, W / 2, H / 2 + 62);
      }
    }
    tex.needsUpdate = true;
  };
  paint(0);
  return { mesh, paint };
}

/** The deck you grab from: a small stack of card backs. */
export function makeDeck(): Mesh {
  const back = backMaterial();
  const e = edge();
  return new Mesh(cardGeo, [e, e, e, e, back, back]);
}
