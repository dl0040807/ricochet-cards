import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
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

// Tuning knobs (PRD: tuned on the headset)
export const THROW_ASSIST = 2.0; // room-mode release-speed multiplier
export const MAX_SPEED = 12; // m/s cap
const GRIP_ON = 0.025; // fingertips closer than this = grip
const GRIP_OFF = 0.04; // fingertips farther than this = release
const DECK_RADIUS = 0.12; // grip must start this close to the deck
const DECK_POS = new Vector3(0.25, 1.0, -0.35); // ponytail: fixed point, follow right hand later
const SAMPLES = 5;

const CARD_W = 0.06, CARD_H = 0.09, CARD_T = 0.006;
const cardGeo = new BoxGeometry(CARD_W, CARD_H, CARD_T);
const cardMat = new MeshStandardMaterial({ color: 0xffffff });

type Sample = { p: Vector3; t: number };

export class ThrowSystem extends createSystem({}) {
  private hands: { joints: Record<string, Object3D>; handedness?: string }[] = [];
  private held?: Mesh;
  private samples: Sample[] = [];
  private tmp = { a: new Vector3(), b: new Vector3(), w: new Vector3(), mid: new Vector3(), dir: new Vector3() };
  private q = new Quaternion();
  private up = new Vector3(0, 1, 0);

  init() {
    const w = this.world as World;
    for (let i = 0; i < 2; i++) {
      const hand = w.renderer.xr.getHand(i) as unknown as Object3D & {
        joints: Record<string, Object3D>;
      };
      w.player.add(hand); // joints are local to the XR origin
      const rec = { joints: hand.joints, handedness: undefined as string | undefined };
      (hand as any).addEventListener('connected', (e: any) => (rec.handedness = e.data?.handedness));
      this.hands.push(rec);
    }
    this.addTestArena(w);
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
        .addComponent(PhysicsShape, { shape: 'Box', dimensions: size, restitution: 0.8, friction: 0.3 })
        .addComponent(PhysicsBody, { state: PhysicsState.Static });
    };
    wall([6, 0.1, 6], [0, -0.05, -2]); // floor
    wall([6, 3, 0.1], [0, 1.5, -3]); // far wall
  }

  private right() {
    // prefer the hand that reports 'right'; fall back to the first with joints
    return this.hands.find((h) => h.handedness === 'right' && h.joints['index-finger-tip']);
  }

  update(_dt: number, time: number) {
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
    this.held = new Mesh(cardGeo, cardMat);
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

    this.held = undefined;
    const w = this.world as World;
    card.removeFromParent(); // createTransformEntity re-parents it into the scene
    w.createTransformEntity(card)
      .addComponent(PhysicsShape, {
        shape: 'Box',
        dimensions: [CARD_W, CARD_H, CARD_T],
        restitution: 0.7,
        friction: 0.2,
      })
      .addComponent(PhysicsBody, { state: PhysicsState.Dynamic })
      .addComponent(PhysicsManipulation, { linearVelocity: [v.x, v.y, v.z] });
  }
}
