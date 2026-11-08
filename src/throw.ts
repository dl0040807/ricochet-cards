import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  CanvasTexture,
  TorusGeometry,
  Entity,
  Object3D,
  PhysicsBody,
  PhysicsManipulation,
  PhysicsShape,
  PhysicsState,
  Quaternion,
  Vector3,
  createSystem,
  type World,
} from '@iwsdk/core';
import { scan } from './colliders.js';

// Tuning knobs (PRD: tuned on the headset)
export const THROW_ASSIST = 3.0; // room-mode release-speed multiplier
export const MAX_SPEED = 15; // m/s cap
const GRIP_ON = 0.025; // fingertips closer than this = grip
const GRIP_OFF = 0.04; // fingertips farther than this = release
const DECK_RADIUS = 0.12; // grip must start this close to the deck
const DECK_POS = new Vector3(0.25, 1.0, -0.35); // ponytail: fixed point, follow right hand later
const SAMPLES = 5;

const CARD_W = 0.06, CARD_H = 0.09, CARD_T = 0.006;
const cardGeo = new BoxGeometry(CARD_W, CARD_H, CARD_T);

// PRD rank ladder: bounces -> label / points
const LABELS = ['2', '5', '8', '10', 'J', 'Q', 'K', 'A'];
const POINTS = [2, 5, 8, 10, 11, 12, 13, 20];
const TARGET = new Vector3(0, 1.4, -2.9); // ponytail: fixed; pinch-to-place comes next
const TARGET_R = 0.15;
const BULL_R = 0.04;
const BOUNCE_DV = 0.8; // m/s velocity change not explained by gravity = a bounce
const FLIGHT_MAX = 6; // s
const GRAVITY = -9.81;
const TABLE_AFTER = 3; // s without a room scan -> table mode

function makeCard(): { mesh: Mesh; paint: (rank: number) => void } {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 192;
  const ctx = c.getContext('2d')!;
  const tex = new CanvasTexture(c);
  const mat = new MeshStandardMaterial({ map: tex });
  const paint = (rank: number) => {
    const ace = rank >= 7;
    ctx.fillStyle = ace ? '#2a0a4a' : '#ffffff';
    ctx.fillRect(0, 0, 128, 192);
    ctx.fillStyle = ace ? '#d58bff' : '#111111';
    ctx.font = 'bold 84px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(LABELS[Math.min(rank, 7)], 64, 120);
    tex.needsUpdate = true;
    mat.emissive.set(ace ? 0x9b30ff : 0x000000); // Neon Ace
  };
  paint(0);
  return { mesh: new Mesh(cardGeo, mat), paint };
}

type Flight = {
  e: Entity; mesh: Mesh; paint: (r: number) => void;
  prev: Vector3; started: number; bounces: number; done: boolean; removeAt: number;
};

type Sample = { p: Vector3; t: number };

export class ThrowSystem extends createSystem({}) {
  private hands: { joints: Record<string, Object3D>; handedness?: string }[] = [];
  private held?: Mesh;
  private heldPaint?: (r: number) => void;
  private flights: Flight[] = [];
  private arena = false;
  private immersiveAt = -1;
  private v = new Vector3();
  score = 0;
  best = 0;
  private samples: Sample[] = [];
  private tmp = { a: new Vector3(), b: new Vector3(), w: new Vector3(), mid: new Vector3(), dir: new Vector3() };
  private q = new Quaternion();
  private up = new Vector3(0, 1, 0);

  init() {
    const w = this.world as World;
    // visible markers: the deck you grab from, and the target ring on the far wall
    const deck = new Mesh(cardGeo, new MeshStandardMaterial({ color: 0xffd34d, emissive: 0x553d00 }));
    deck.position.copy(DECK_POS);
    deck.rotation.x = -0.4;
    w.createTransformEntity(deck);
    const ring = new Mesh(new TorusGeometry(TARGET_R, 0.012, 12, 48), new MeshStandardMaterial({ color: 0xff3d71, emissive: 0xaa1040 }));
    ring.position.copy(TARGET);
    w.createTransformEntity(ring);
    for (let i = 0; i < 2; i++) {
      const hand = w.renderer.xr.getHand(i) as unknown as Object3D & {
        joints: Record<string, Object3D>;
      };
      w.player.add(hand); // joints are local to the XR origin
      const rec = { joints: hand.joints, handedness: undefined as string | undefined };
      (hand as any).addEventListener('connected', (e: any) => (rec.handedness = e.data?.handedness));
      this.hands.push(rec);
    }
  }

  // Temporary walls so a throw has something to hit. Step 2 replaces these with the room scan.
  private addTestArena(w: World) {
    const wall = (size: [number, number, number], pos: [number, number, number]) => {
      const m = new Mesh(
        new BoxGeometry(...size),
        new MeshStandardMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.15 }),
      );
      m.position.set(...pos);
      w.createTransformEntity(m)
        .addComponent(PhysicsShape, { shape: 'Box', dimensions: size, restitution: 0.85, friction: 0.3 })
        .addComponent(PhysicsBody, { state: PhysicsState.Static });
    };
    wall([6, 0.1, 6], [0, -0.05, -2]); // floor
    wall([6, 3, 0.1], [0, 1.5, -3]); // far wall
  }

  private right() {
    // prefer the hand that reports 'right'; fall back to the first with joints
    return this.hands.find((h) => h.handedness === 'right' && h.joints['index-finger-tip']);
  }

  update(dt: number, time: number) {
    this.updateFlights(dt, time);
    const immersive = !String(this.world.visibilityState).toLowerCase().startsWith('non');
    if (immersive && this.immersiveAt < 0) this.immersiveAt = time; // count from AR entry, not app start
    if (!immersive) this.immersiveAt = -1;
    if (!this.arena && this.immersiveAt >= 0 && time - this.immersiveAt > TABLE_AFTER && scan.colliders === 0) {
      this.arena = true; // no room scan: table mode fallback
      this.addTestArena(this.world as World);
    }
    const hand = this.right();
    const idx = hand?.joints['index-finger-tip'];
    const mid = hand?.joints['middle-finger-tip'];
    if (!hand || !idx || !mid) return this.drop();

    const { a, b, w, dir } = this.tmp;
    idx.getWorldPosition(a);
    mid.getWorldPosition(b);
    const gap = a.distanceTo(b);
    w.copy(a).add(b).multiplyScalar(0.5);

    if (!this.held) {
      if (gap < GRIP_ON && w.distanceTo(DECK_POS) < DECK_RADIUS) this.grab();
      return;
    }

    // holding: follow fingertips, long edge along the fingers
    this.held.position.copy(w);
    const wrist = hand.joints['wrist'];
    if (wrist) {
      wrist.getWorldPosition(dir);
      dir.subVectors(w, dir).normalize();
      this.held.quaternion.copy(this.q.setFromUnitVectors(this.up, dir));
    }
    this.samples.push({ p: w.clone(), t: time }); // ponytail: allocs 1 Vector3/frame, pool if GC hitches
    if (this.samples.length > SAMPLES) this.samples.shift();

    if (gap > GRIP_OFF) this.release();
  }

  private grab() {
    const c = makeCard();
    this.held = c.mesh;
    this.heldPaint = c.paint;
    (this.world as World).scene.add(this.held);
    this.samples.length = 0;
  }

  private drop() {
    if (!this.held) return;
    this.held.removeFromParent();
    this.held = undefined;
  }

  private release() {
    const card = this.held!;
    const v = new Vector3();
    const s = this.samples;
    if (s.length >= 2) {
      const dt = s[s.length - 1].t - s[0].t;
      if (dt > 0) v.subVectors(s[s.length - 1].p, s[0].p).divideScalar(dt);
    }
    v.multiplyScalar(THROW_ASSIST);
    if (v.length() > MAX_SPEED) v.setLength(MAX_SPEED);
    console.log(`[throw] release speed=${v.length().toFixed(2)} m/s scanColliders=${scan.colliders} arena=${this.arena}`);

    this.held = undefined;
    const w = this.world as World;
    card.removeFromParent(); // createTransformEntity re-parents it into the scene
    const e = w.createTransformEntity(card)
      .addComponent(PhysicsShape, {
        shape: 'Box',
        dimensions: [CARD_W, CARD_H, CARD_T],
        restitution: 0.85, // ~15% speed lost per bounce (tuning value)
        friction: 0.2,
      })
      .addComponent(PhysicsBody, { state: PhysicsState.Dynamic })
      .addComponent(PhysicsManipulation, { linearVelocity: [v.x, v.y, v.z] });
    this.flights.push({ e, mesh: card, paint: this.heldPaint!, prev: v.clone(), started: -1, bounces: 0, done: false, removeAt: 0 });
  }

  private updateFlights(dt: number, time: number) {
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i];
      if (f.started < 0) f.started = time;
      if (f.done) {
        if (time > f.removeAt) { f.e.dispose(); this.flights.splice(i, 1); }
        continue;
      }
      const vv = f.e.getVectorView(PhysicsBody, '_linearVelocity');
      this.v.set(vv[0], vv[1], vv[2]);
      const p = f.mesh.position;

      if (p.y < 0.04) { this.finish(f, time, 0); continue; } // floor ends the throw, 0 points
      if (p.distanceTo(TARGET) < TARGET_R) {
        const bonus = p.distanceTo(TARGET) < BULL_R ? 5 : 0;
        f.e.removeComponent(PhysicsBody); // card sticks where it hit
        this.finish(f, time, POINTS[Math.min(f.bounces, 7)] + bonus);
        continue;
      }
      if (time - f.started > FLIGHT_MAX) { this.finish(f, time, 0); continue; }

      // bounce = velocity change beyond what gravity explains
      if (f.prev.lengthSq() > 0.09) {
        const dvx = this.v.x - f.prev.x, dvz = this.v.z - f.prev.z;
        const dvy = this.v.y - f.prev.y - GRAVITY * dt;
        if (Math.hypot(dvx, dvy, dvz) > BOUNCE_DV) {
          f.bounces++;
          f.paint(Math.min(f.bounces, 7));
        }
      }
      f.prev.copy(this.v);
    }
  }

  private finish(f: Flight, time: number, points: number) {
    f.done = true;
    f.removeAt = time + 3;
    this.score += points;
    this.best = Math.max(this.best, this.score);
    console.log(`[throw] bounces=${f.bounces} points=${points} score=${this.score}`);
  }
}
