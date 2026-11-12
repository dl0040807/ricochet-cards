// Small sign on the desk: three status bars, the streak, and one guide line.
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry } from '@iwsdk/core';
import type { Save } from './state.js';

export class Hud {
  private c = document.createElement('canvas');
  private tex: CanvasTexture;
  mesh: Mesh;
  private key = '';

  constructor() {
    this.c.width = 512;
    this.c.height = 288;
    this.tex = new CanvasTexture(this.c);
    this.mesh = new Mesh(new PlaneGeometry(0.24, 0.135), new MeshBasicMaterial({ map: this.tex, transparent: true }));
  }

  draw(s: Save, guide: string) {
    const vals = [Math.round(s.full), Math.round(s.clean), Math.round(s.mood)];
    const key = `${vals}|${s.streak}|${guide}`;
    if (key === this.key) return; // redraw only when something visible changed
    this.key = key;
    const g = this.c.getContext('2d')!;
    g.clearRect(0, 0, 512, 288);
    g.fillStyle = 'rgba(40,28,20,0.82)';
    g.beginPath();
    g.roundRect(0, 0, 512, 288, 28);
    g.fill();
    g.font = 'bold 26px sans-serif';
    g.textBaseline = 'middle';
    const rows: [string, string][] = [['포만감', '#f2a541'], ['청결', '#5cc8e8'], ['기분', '#ff7a9c']];
    rows.forEach(([label, color], i) => {
      const y = 44 + i * 46;
      g.fillStyle = '#fff3df';
      g.textAlign = 'left';
      g.fillText(label, 28, y);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.roundRect(130, y - 12, 260, 24, 12); g.fill();
      g.fillStyle = color;
      g.beginPath(); g.roundRect(130, y - 12, Math.max(24, 2.6 * vals[i]), 24, 12); g.fill();
      g.fillStyle = '#fff3df';
      g.textAlign = 'right';
      g.fillText(String(vals[i]), 484, y);
    });
    g.textAlign = 'left';
    g.font = '22px sans-serif';
    g.fillStyle = '#ffd98a';
    g.fillText(`연속 ${s.streak}일`, 28, 182);
    g.font = 'bold 25px sans-serif';
    g.fillStyle = '#ffffff';
    // wrap the guide over two lines
    const words = guide.split(' ');
    let line = '', y = 222;
    for (const w of words) {
      if (g.measureText(line + w).width > 460 && line) { g.fillText(line, 28, y); line = ''; y += 32; }
      line += w + ' ';
    }
    g.fillText(line, 28, y);
    this.tex.needsUpdate = true;
  }
}
