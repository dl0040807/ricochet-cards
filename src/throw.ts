import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  Raycaster,
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
import { game, record, reset } from './game.js';
import { sfx } from './audio.js';
import { Hud } from './hud.js';
import { CARD_H, CARD_T, CARD_W, makeCard, makeDeck } from './card.js';

// Tuning knobs (PRD: tuned on the headset)
export const THROW_ASSIST = 2.0; // room-mode release-speed multiplier
export const MAX_SPEED = 12; // m/s cap
const GRIP_ON = 0.025; // fingertips closer than this = grip
const GRIP_OFF = 0.05; // fingertips farther than this = release
const DECK_RADIUS = 0.12; // grip must start this close to the deck
const DECK_POS = new Vector3(0.25, 1.0, -0.35); // ponytail: fixed point, follow right hand later
const SAMPLES = 6;
const MIN_THROW = 0.8; // m/s: slower fingers-open is a wind-up slip, not a throw
const LOST_GRACE = 0.4; // s of lost tracking before the card is put back
const SLIP_GRACE = 0.5; // s of open fingers without a snap before the card is put back
const AIM_ASSIST = 0; // 0..1 blend of throw direction toward where the head faces


// PRD rank ladder: bounces -> label / points
const POINTS = [2, 5, 8, 10, 11, 12, 13, 20];
const TARGET = new Vector3(0, 1.4, -2.9); // default until the player pinches a wall
const TARGET_R = 0.15;
const TARGET_EVERY = 3; // throws between target moves
const AIM_LINE_THROWS = 3; // aim line is shown for the first N throws only
const PINCH_ON = 0.02; // thumb-index gap that counts as a pinch
const BULL_R = 0.04;
const BOUNCE_DV = 0.8; // m/s velocity change not explained by gravity = a bounce
const FLOOR_Y = 0.09; // card center this low = lying on the floor (long edge is 9 cm)
const REST_SPEED = 0.4; // m/s
const REST_TIME = 0.4; // s below REST_SPEED = card stopped
const BOUNCE_GAP = 0.1; // s between countable bounces
const WARMUP = 3; // frames before the physics velocity is trustworthy (first reads are 0)
const FLIGHT_MAX = 6; // s
const GRAVITY = -9.81;
const TABLE_AFTER = 3; // s without a room scan -> table mode

type Flight = {
  e: Entity; mesh: Mesh; paint: (r: number) => void;
  prev: Vector3; age: number; rest: number; lastBounce: number; started: number; bounces: number; done: boolean; removeAt: number;
};

type Sample = { p: Vector3; t: number };

const immersiveNow = (w: World) => !String(w.visibilityState).toLowerCase().startsWith('non');

export class ThrowSystem extends createSystem({}) {
  private hands: { joints: Record<string, Object3D>; handedness?: string }[] = [];
  private held?: Mesh;
  private heldPaint?: (r: number) => void;
  private flights: Flight[] = [];
  private arena = false;
  private immersiveAt = -1;
  private lostAt = -1;
  private openAt = -1;
  private fwd = new Vector3();
  private ring!: Mesh;
  private aim!: Mesh;
  private zAxis = new Vector3(0, 0, 1);
  private handDir = new Vector3(0, 0, -1);
  private pinching = false;
  private ray = new Raycaster();
  private ndir = new Vector3();
  private tp = new Vector3();
  private v = new Vector3();
  private hud = new Hud();
  private hudPlaced = false;
  private samples: Sample[] = [];
  private tmp = { a: new Vector3(), b: new Vector3(), w: new Vector3(), mid: new Vector3(), dir: new Vector3() };
  private q = new Quaternion();
  private up = new Vector3(0, 1, 0);

  init() {
    const w = this.world as World;
    // visible markers: the deck you grab from, and the target ring on the far wall
    const deck = makeDeck();
    deck.position.copy(DECK_POS);
    deck.rotation.x = -0.4;
    w.createTransformEntity(deck);
    const ring = new Mesh(new TorusGeometry(TARGET_R, 0.012, 12, 48), new MeshStandardMaterial({ color: 0xff3d71, emissive: 0xaa1040 }));
    ring.position.copy(TARGET);
    w.createTransformEntity(ring);
    this.ring = ring;
    w.scene.add(this.hud.mesh);
    this.aim = new Mesh(new BoxGeometry(0.004, 0.004, 1), new MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x4090a0, transparent: true, opacity: 0.45 }));
    this.aim.visible = false;
    w.scene.add(this.aim);
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
      scan.proxies.push(m);
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
    if (immersiveNow(this.world) && !this.hudPlaced) { this.hud.place(this.world as World); this.hudPlaced = true; }
    if (!immersiveNow(this.world)) this.hudPlaced = false;
    if (game.dirty) this.hud.draw();
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
    if (!hand || !idx || !mid) {
      // hand briefly out of view while winding up: keep the card for a moment
      if (this.held) {
        if (this.lostAt < 0) this.lostAt = time;
        if (time - this.lostAt > LOST_GRACE) this.drop();
      }
      return;
    }
    this.lostAt = -1;

    const { a, b, w, dir } = this.tmp;
    idx.getWorldPosition(a);
    mid.getWorldPosition(b);
    const gap = a.distanceTo(b);
    w.copy(a).add(b).multiplyScalar(0.5);

    // pinch a wall (thumb + index, away from the deck) to pin the target ring there
    const thumb = hand.joints['thumb-tip'];
    if (thumb && !this.held) {
      thumb.getWorldPosition(this.tp);
      const pinch = this.tp.distanceTo(a) < PINCH_ON && w.distanceTo(DECK_POS) > DECK_RADIUS * 2;
      if (pinch && !this.pinching) { if (game.over) reset(); else this.placeTarget(hand, a); }
      this.pinching = pinch;
    }

    if (!this.held) {
      if (!game.over && gap < GRIP_ON && w.distanceTo(DECK_POS) < DECK_RADIUS) this.grab();
      return;
    }

    // holding: follow fingertips, long edge along the fingers
    this.held.position.copy(w);
    const wrist = hand.joints['wrist'];
    if (wrist) {
      wrist.getWorldPosition(dir);
      dir.subVectors(w, dir).normalize();
      this.held.quaternion.copy(this.q.setFromUnitVectors(this.up, dir));
      this.handDir.copy(dir);
    }
    // sample the wrist: it doesn't jitter when the fingers open (fall back to the fingertip midpoint)
    const ref = wrist ? wrist.getWorldPosition(this.tmp.dir) : w;
    this.samples.push({ p: ref.clone(), t: time }); // ponytail: allocs 1 Vector3/frame, pool if GC hitches
    if (this.samples.length > SAMPLES) this.samples.shift();

    // faint aim line, first throws only: along the hand's current motion (or where the fingers point)
    this.aim.visible = game.throws < AIM_LINE_THROWS;
    if (this.aim.visible) {
      const vel = this.velocity();
      const d = vel.length() > 0.3 ? vel.clone().normalize() : this.handDir; // ponytail: clone per frame, only while the line is on
      this.aim.scale.z = 1.5;
      this.aim.position.copy(w).addScaledVector(d, 0.75);
      this.aim.quaternion.setFromUnitVectors(this.zAxis, d);
    }

    if (gap > GRIP_OFF) {
      if (this.openAt < 0) this.openAt = time;
      const v = this.velocity();
      (this.world as World).camera.getWorldDirection(this.fwd);
      if (v.length() >= MIN_THROW && v.dot(this.fwd) > 0) this.release();
      else if (time - this.openAt > SLIP_GRACE) this.drop(); // opened without a snap: put it back
    } else this.openAt = -1;
  }

  private placeTarget(hand: { joints: Record<string, Object3D> }, tip: Vector3) {
    const wrist = hand.joints['wrist'];
    if (!wrist) return;
    wrist.getWorldPosition(this.ndir);
    this.ndir.subVectors(tip, this.ndir).normalize(); // wrist -> fingertip = where the hand points
    this.ray.set(tip, this.ndir);
    const hit = this.ray.intersectObjects(scan.proxies, false)[0];
    if (!hit?.face) { console.log(`[throw] pinch: no wall hit, dir=${this.ndir.x.toFixed(2)},${this.ndir.y.toFixed(2)},${this.ndir.z.toFixed(2)} proxies=${scan.proxies.length}`); return; }
    this.setTarget(hit.point, hit.face.normal); // boxes are world-axis-aligned, so the local normal is the world normal
    game.targetPlaced = true;
    game.dirty = true;
  }

  private setTarget(point: Vector3, n: Vector3) {
    TARGET.copy(point).addScaledVector(n, 0.01);
    this.ring.position.copy(TARGET);
    this.ring.lookAt(TARGET.x + n.x, TARGET.y + n.y, TARGET.z + n.z);
    console.log(`[throw] target at ${TARGET.x.toFixed(2)},${TARGET.y.toFixed(2)},${TARGET.z.toFixed(2)}`);
  }

  /** Every 3 throws the ring jumps to another wall spot in front of the player (random rays from the head). */
  private moveTarget() {
    const w = this.world as World;
    const head = w.camera.getWorldPosition(this.tp);
    w.camera.getWorldDirection(this.fwd);
    const yaw0 = Math.atan2(this.fwd.x, this.fwd.z);
    for (let i = 0; i < 30; i++) {
      const yaw = yaw0 + (Math.random() - 0.5) * 2.4; // +-70 deg around where you face
      const pitch = (Math.random() - 0.3) * 0.5;
      this.ndir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      this.ray.set(head, this.ndir);
      const hit = this.ray.intersectObjects(scan.proxies, false)[0];
      if (!hit?.face || hit.distance < 1.5 || hit.distance > 5) continue;
      if (Math.abs(hit.face.normal.y) > 0.3) continue; // walls and upright faces only
      if (hit.point.y < 0.5 || hit.point.y > 2.2) continue;
      this.setTarget(hit.point, hit.face.normal);
      game.last = 'Target moved';
      game.dirty = true;
      return;
    }
  }

  private grab() {
    const c = makeCard();
    this.held = c.mesh;
    this.heldPaint = c.paint;
    (this.world as World).scene.add(this.held);
    this.samples.length = 0;
    sfx.grab();
  }

  private drop() {
    this.aim.visible = false;
    if (!this.held) return;
    this.held.removeFromParent();
    this.held = undefined;
    this.openAt = this.lostAt = -1;
  }

  private velocity() {
    const s = this.samples;
    const out = this.tmp.mid.set(0, 0, 0);
    const n = s.length;
    if (n >= 2) {
      const a = s[Math.max(0, n - 4)], b = s[n - 1]; // last ~3 frames
      const dt = b.t - a.t;
      if (dt > 0) out.subVectors(b.p, a.p).divideScalar(dt);
    }
    return out;
  }

  private release() {
    const card = this.held!;
    const v = this.velocity().clone();
    (this.world as World).camera.getWorldDirection(this.fwd);
    const speed = v.length();
    if (speed > 0) v.normalize().lerp(this.fwd, AIM_ASSIST).setLength(speed); // steer toward where you face
    v.multiplyScalar(THROW_ASSIST);
    if (v.length() > MAX_SPEED) v.setLength(MAX_SPEED);
    console.log(`[throw] release speed=${v.length().toFixed(2)} m/s scanColliders=${scan.colliders} arena=${this.arena}`);

    this.held = undefined;
    this.aim.visible = false;
    this.openAt = this.lostAt = -1;
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
    this.flights.push({ e, mesh: card, paint: this.heldPaint!, prev: v.clone(), age: 0, rest: 0, lastBounce: -1, started: -1, bounces: 0, done: false, removeAt: 0 });
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

      if (p.y < FLOOR_Y) { this.finish(f, time, 0); continue; } // floor ends the throw, 0 points
      if (p.distanceTo(TARGET) < TARGET_R) {
        const bonus = p.distanceTo(TARGET) < BULL_R ? 5 : 0;
        f.e.removeComponent(PhysicsBody); // card sticks where it hit
        this.finish(f, time, POINTS[Math.min(f.bounces, 7)] + bonus);
        continue;
      }
      if (time - f.started > FLIGHT_MAX) { this.finish(f, time, 0); continue; }

      // bounce = velocity change beyond what gravity explains
      if (++f.age <= WARMUP) { f.prev.copy(this.v); continue; }
      // card lying still on furniture: the throw is over (otherwise jitter would keep adding bounces)
      f.rest = this.v.length() < REST_SPEED ? f.rest + dt : 0;
      if (f.rest > REST_TIME) { this.finish(f, time, 0); continue; }
      if (f.prev.lengthSq() > 0.09) {
        const dvx = this.v.x - f.prev.x, dvz = this.v.z - f.prev.z;
        const dvy = this.v.y - f.prev.y - GRAVITY * dt;
        if (Math.hypot(dvx, dvy, dvz) > BOUNCE_DV && p.y > FLOOR_Y + 0.06 && time - f.lastBounce > BOUNCE_GAP) {
          f.lastBounce = time; // a floor hit ends the throw, it isn't a rank-up
          f.bounces++;
          console.log(`[throw] bounce#${f.bounces} pos=${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)} v=${this.v.x.toFixed(1)},${this.v.y.toFixed(1)},${this.v.z.toFixed(1)} dv=${Math.hypot(dvx, dvy, dvz).toFixed(2)}`);
          f.paint(Math.min(f.bounces, 7));
          if (f.bounces === 7) sfx.ace(); else sfx.bounce(Math.min(f.bounces, 7));
        }
      }
      f.prev.copy(this.v);
    }
  }

  private finish(f: Flight, time: number, points: number) {
    f.done = true;
    f.removeAt = time + 3;
    record(points, f.bounces);
    if (points > 0) sfx.score(points); else sfx.miss();
    if (game.over) sfx.over();
    else if (game.throws % TARGET_EVERY === 0) this.moveTarget();
    console.log(`[throw] bounces=${f.bounces} points=${points} score=${game.score} throws=${game.throws}`);
  }
}
