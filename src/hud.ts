import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3, type World } from '@iwsdk/core';
import { MAX_THROWS, game } from './game.js';

const W = 640, H = 360;

export class Hud {
  readonly mesh: Mesh;
  private ctx: CanvasRenderingContext2D;
  private tex: CanvasTexture;

  constructor() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    this.ctx = c.getContext('2d')!;
    this.tex = new CanvasTexture(c);
    this.mesh = new Mesh(new PlaneGeometry(0.64, 0.36), new MeshBasicMaterial({ map: this.tex, transparent: true }));
    this.mesh.visible = false;
  }

  /** Float the panel ~1.8 m ahead of where the player is looking, once. */
  place(world: World) {
    const head = world.camera.getWorldPosition(new Vector3());
    const fwd = world.camera.getWorldDirection(new Vector3());
    fwd.y = 0;
    fwd.normalize();
    this.mesh.position.copy(head).addScaledVector(fwd, 1.8);
    this.mesh.position.y = head.y - 0.05;
    this.mesh.lookAt(head.x, this.mesh.position.y, head.z);
    this.mesh.visible = true;
  }

  draw() {
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(10,12,24,0.72)';
    g.roundRect(0, 0, W, H, 28);
    g.fill();
    g.textAlign = 'center';
    g.fillStyle = '#fff';

    if (game.over) {
      g.font = 'bold 40px sans-serif';
      g.fillText('Final score', W / 2, 70);
      g.font = 'bold 110px sans-serif';
      g.fillText(String(game.score), W / 2, 190);
      g.font = '30px sans-serif';
      g.fillStyle = '#d58bff';
      g.fillText(`Neon Aces: ${game.aces}     Best: ${game.best}`, W / 2, 245);
      g.fillStyle = '#9fe8ff';
      g.fillText('Pinch thumb + index to play again', W / 2, 310);
    } else {
      g.font = '28px sans-serif';
      g.fillStyle = '#9fe8ff';
      g.fillText(`Throw ${Math.min(game.throws + 1, MAX_THROWS)} / ${MAX_THROWS}      Best ${game.best}`, W / 2, 50);
      g.font = 'bold 100px sans-serif';
      g.fillStyle = '#fff';
      g.fillText(String(game.score), W / 2, 160);
      g.font = '32px sans-serif';
      g.fillStyle = '#ffd34d';
      g.fillText(game.last, W / 2, 210);
      g.font = '26px sans-serif';
      g.fillStyle = '#ffffffcc';
      const hint = !game.targetPlaced
        ? 'Pinch a wall to place the target'
        : game.throws === 0
          ? 'Grab the blue deck card with two fingers, flick to throw. Every wall bounce ranks it up'
          : '';
      g.fillText(hint, W / 2, 290, W - 40);
    }
    this.tex.needsUpdate = true;
    game.dirty = false;
  }
}
