// A flat canvas-textured panel with pinchable rectangles.
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';

type Hit = { id: string; x: number; y: number; w: number; h: number };
const tmp = new Vector3();

export class Panel {
  c = document.createElement('canvas');
  g: CanvasRenderingContext2D;
  tex: CanvasTexture;
  mesh: Mesh;
  hits: Hit[] = [];

  constructor(public w: number, public h: number, ppm = 2400) {
    this.c.width = Math.round(w * ppm);
    this.c.height = Math.round(h * ppm);
    this.g = this.c.getContext('2d')!;
    this.tex = new CanvasTexture(this.c);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: this.tex, transparent: true }));
  }
  get W() { return this.c.width; }
  get H() { return this.c.height; }

  begin(bg?: string, r = 36) {
    const g = this.g;
    this.hits.length = 0;
    g.clearRect(0, 0, this.W, this.H);
    if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, this.W, this.H, r); g.fill(); }
    g.textBaseline = 'middle';
    return g;
  }
  text(s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left', weight = '') {
    const g = this.g;
    g.font = `${weight} ${size}px sans-serif`;
    g.fillStyle = color;
    g.textAlign = align;
    g.fillText(s, x, y);
  }
  button(id: string, x: number, y: number, w: number, h: number, label?: string, bg = '#ffffff22', fg = '#fff', size = h * 0.42) {
    this.hits.push({ id, x, y, w, h });
    if (label === undefined) return;
    const g = this.g;
    g.fillStyle = bg; g.beginPath(); g.roundRect(x, y, w, h, Math.min(h / 2, 22)); g.fill();
    this.text(label, x + w / 2, y + h / 2, size, fg, 'center', 'bold');
  }
  /** Dark frosted-glass card (the design's panel style). */
  glass(r = 56) {
    const g = this.g, gr = g.createLinearGradient(0, 0, 0, this.H);
    gr.addColorStop(0, 'rgba(72,76,90,0.95)');
    gr.addColorStop(1, 'rgba(60,60,66,0.95)');
    g.fillStyle = gr;
    g.beginPath(); g.roundRect(2, 2, this.W - 4, this.H - 4, r); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 3; g.stroke();
  }
  box(x: number, y: number, w: number, h: number, fill: string, r = 28) {
    this.g.fillStyle = fill;
    this.g.beginPath(); this.g.roundRect(x, y, w, h, r); this.g.fill();
  }
  dot(x: number, y: number, r: number, fill: string) {
    this.g.fillStyle = fill;
    this.g.beginPath(); this.g.arc(x, y, r, 0, 7); this.g.fill();
  }
  /** Wrap text into at most `lines` lines; returns the y after the last line. */
  wrap(s: string, x: number, y: number, maxW: number, size: number, color: string, weight = '', lh = size * 1.35, lines = 2) {
    const g = this.g;
    g.font = `${weight} ${size}px sans-serif`;
    let line = '', n = 0;
    for (const ch of s) {
      if (g.measureText(line + ch).width > maxW && line) {
        if (++n === lines) { line = line.slice(0, -1) + '…'; break; }
        this.text(line, x, y, size, color, 'left', weight); y += lh; line = '';
      }
      line += ch;
    }
    this.text(line, x, y, size, color, 'left', weight);
    return y + lh;
  }
  /** An image cover-cropped into a rounded box. */
  image(im: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, r = 28) {
    const g = this.g, sc = Math.max(w / im.width, h / im.height);
    g.save();
    g.beginPath(); g.roundRect(x, y, w, h, r); g.clip();
    g.drawImage(im, x + w / 2 - im.width * sc / 2, y + h / 2 - im.height * sc / 2, im.width * sc, im.height * sc);
    g.restore();
  }
  done() { this.tex.needsUpdate = true; }

  /** A world-space fingertip on (within `slab` m of) the panel -> the button id under it, '' on the panel, null off it. */
  hit(p: Vector3, slab = 0.04): string | null {
    if (!this.mesh.visible || !this.mesh.parent?.visible) return null;
    const l = this.mesh.worldToLocal(tmp.copy(p));
    if (Math.abs(l.z) > slab || Math.abs(l.x) > this.w / 2 || Math.abs(l.y) > this.h / 2) return null;
    const x = (l.x / this.w + 0.5) * this.W, y = (0.5 - l.y / this.h) * this.H;
    return this.hits.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)?.id ?? '';
  }
  /** Signed distance of a world point in front of the panel (+ = toward the viewer). */
  front(p: Vector3) { return this.mesh.worldToLocal(tmp.copy(p)).z; }
}
