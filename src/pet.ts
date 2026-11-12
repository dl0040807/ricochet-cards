// 다람쥐 키우기: the whole desk-pet loop in one system.
// Everything lives under `stage` (origin = desk surface in front of the player, +Z toward the player),
// and all hand logic runs in stage-local coordinates.
import {
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Object3D,
  Quaternion,
  Vector3,
  XRPlane,
  createSystem,
  type World,
} from '@iwsdk/core';
import { sfx } from './audio.js';
import { Hud } from './hud.js';
import {
  SKINS, makeAcorn, makeBasket, makeChest, makeHeart, makeKey, makePedestal, makePoop, makeSlot, makeSquirrel, makeTrash, makeTree, setGoldFur, shadowOf, makeFoxtail, makeBall, makeToyBox, makeZzz, makeNameTag, FOXTAIL_LEN, BALL_R,
  type Squirrel,
} from './model.js';
import { NAMES, SKIN_IDS, addPoop, cleanPoop, drawSkin, feed, flick, load, pet, play, save, tick, type Save } from './state.js';

// ---- layout (stage-local metres) ----
const HOME = new Vector3(0, 0, 0);
const FRONT = new Vector3(0, 0, 0.08);
const HOLE = new Vector3(0, 0, -0.1);
const TREE = new Vector3(0, 0, -0.2);
const BASKET = new Vector3(-0.2, 0, 0.06);
const TRASH = new Vector3(0.2, 0, 0.09);
const CHEST = new Vector3(0.17, 0, -0.13);
const KEY_REST = new Vector3(0.07, 0.014, 0.13);
const TOYS = new Vector3(-0.15, 0, -0.17);
const FOX_HOME = new Vector3(-0.17, 0.03, -0.17);
const BALL_HOME = new Vector3(-0.13, BALL_R + 0.004, -0.165);
const EDGE = 0.4; // desk radius the ball can roll on before it falls off
const TAG = new Vector3(0.075, 0, -0.17);
const POOP_SPOTS = [new Vector3(-0.1, 0, -0.04), new Vector3(0.09, 0, 0.01), new Vector3(-0.07, 0, 0.12)];
// wardrobe: 12 slots, 3 columns x 4 rows, right of the chest
const slotPos = (i: number, out: Vector3) => out.set(0.29 + (i % 3) * 0.056, 0.012, -0.26 + Math.floor(i / 3) * 0.056);

// ---- tuning (PRD: adjust on the headset) ----
const PINCH_ON = 0.02, PINCH_OFF = 0.045; // thumb-index gap
const PICK_R = 0.065; // how close a pinch must be to an item
const FEED_R = 0.12; // release an acorn this close to the mouth
const PET_R = 0.09; // hand this close to the head/body centre = touching (radius ~4.6 cm + 3 cm + slack)
const PET_SLOW = 0.35; // m/s: slower than this is a stroke
const PET_TIME = 0.5; // s of slow touching before it counts
const FLICK_ARM = 0.02, FLICK_OPEN = 0.035, FLICK_SPEED = 0.8, FLICK_R = 0.11, FLICK_WINDOW = 0.4;
const TWIST = 1.05; // rad (60 deg) of wrist roll to turn the key
const WALK = 0.2; // m/s
const CATCH_R = 0.09; // foxtail head this close to the squirrel's head = a catch
const THROW_GAIN = 0.8; // ball release speed = pinch speed x this
const THROW_MAX = 1.2; // m/s cap so a toss stays on the desk
const ROLL_DRAG = 4; // 1/s rolling friction

type Kind = 'acorn' | 'poop' | 'key' | 'skin' | 'foxtail' | 'ball';
type Held = { kind: Kind; obj: Object3D; id?: string };
type Hand = {
  joints: Record<string, Object3D>; ok: boolean;
  idx: Vector3; thumb: Vector3; mid: Vector3; palm: Vector3; pinch: Vector3; pIdx: Vector3; pMid: Vector3;
  vIdx: number; vMid: number; palmUp: boolean; roll: number;
  pinching: boolean; held: Held | null; armedAt: number; petT: number; twist0: number | null; vPinch: Vector3; pPinch: Vector3;
};
type Act = 'idle' | 'greet' | 'eat' | 'full' | 'happy' | 'ouch' | 'sulk' | 'thank' | 'spin' | 'fetchGo' | 'fetchHide' | 'fetchBack' | 'offer' | 'sleep' | 'jump' | 'roll' | 'ballGo' | 'ballBack' | 'beg' | 'peek' | 'refuse' | 'flinch' | 'wake';

export class PetSystem extends createSystem({ planes: { required: [XRPlane] } }) {
  private stage = new Group();
  private pedestal = makePedestal();
  private sq!: Squirrel;
  private chest!: ReturnType<typeof makeChest>;
  private hud = new Hud();
  private s!: Save;
  private hands: Hand[] = [];
  private poops: Object3D[] = [];
  private skinObj = new Map<string, Object3D>();
  private shadows = new Map<string, Object3D>(); // silhouettes of skins not owned yet
  private key: Object3D | null = null;
  private keyOn: 'mouth' | 'palm' | 'desk' | 'held' | null = null;
  private keyHand: Hand | null = null;
  private keyPalmT = 0;
  private popped: string | null = null; // skin hovering over the open chest
  private hearts: { m: Object3D; t: number }[] = [];
  private zzz = makeZzz();
  private tag = makeNameTag();
  private intro: 'sleep' | 'greet' | 'first' = 'first'; // what to do once the player is actually in XR looking at the desk
  private pt = 0; // seconds since the stage was placed in XR (drives the first-visit script)
  private touching = false;
  private flinchAt = 0;
  private fox = makeFoxtail();
  private foxTip = new Vector3();
  private catches = 0;
  private catchAt = 0;
  private ball = makeBall();
  private ballVel = new Vector3();
  private ballOn: 'box' | 'held' | 'free' | 'mouth' = 'box';
  private ballThrown = false; // only a ball you threw gets fetched (not the one it just dropped for you)
  private act: Act = 'idle';
  private actEnd = 0;
  private actDur = 1;
  private target = new Vector3();
  private yaw = 0;
  private st = 0; // seconds this session
  private step = 0; // first-run script step
  private stepAt = 0;
  private keyAt = -1;
  private poopAt = -1;
  private lidCloseAt = 0;
  private flash = '';
  private flashEnd = 0;
  private saveT = 0;
  private enterAt = -1;
  private placed = false;
  private box = new Box3();
  private v = new Vector3();
  private v2 = new Vector3();
  private v3 = new Vector3();
  private q = new Quaternion();

  init() {
    const w = this.world as World;
    w.scene.add(new HemisphereLight(0xffffff, 0x9a8a7a, 1.6)); // passthrough scenes have no lights of their own
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.4, 1, 0.6);
    w.scene.add(sun);

    this.stage.position.set(0, 1.0, -0.45);
    w.createTransformEntity(this.stage);
    const put = (o: Object3D, p: Vector3) => (o.position.copy(p), this.stage.add(o), o);
    this.pedestal.visible = false;
    this.stage.add(this.pedestal);
    put(makeTree(), TREE);
    put(makeBasket(), BASKET);
    put(makeTrash(), TRASH);
    put(makeToyBox(), TOYS);
    put(this.fox, FOX_HOME);
    this.fox.rotation.z = 1.2; // lying in the toy box
    put(this.ball, BALL_HOME);
    put(this.tag.root, TAG).rotation.y = -0.3;
    this.chest = makeChest();
    put(this.chest.root, CHEST);
    this.sq = makeSquirrel();
    this.stage.add(this.sq.root);
    this.hud.mesh.position.set(-0.24, 0.17, -0.16);
    this.hud.mesh.rotation.y = 0.45;
    this.stage.add(this.hud.mesh);
    SKIN_IDS.forEach((_, i) => { const d = makeSlot(); slotPos(i, this.v); d.position.set(this.v.x, 0.001, this.v.z); this.stage.add(d); });
    for (let i = 0; i < 6; i++) {
      const m = makeHeart();
      m.visible = false;
      this.stage.add(m);
      this.hearts.push({ m, t: 9 });
    }

    const url = new URL(location.href);
    if (url.searchParams.has('reset')) localStorage.removeItem('daramji.save');
    const nextDay = url.searchParams.has('nextday');
    const { s, away } = load(Date.now(), nextDay);
    if (url.searchParams.has('reset') || url.searchParams.has('nextday')) { // one-shot: a reload must not repeat it
      url.searchParams.delete('reset');
      url.searchParams.delete('nextday');
      history.replaceState(null, '', url);
      save(s);
    }
    this.s = s;
    for (const id of SKIN_IDS) {
      if (s.owned.includes(id)) continue;
      const def = SKINS.find((k) => k.id === id)!, sh = shadowOf(def.make);
      slotPos(SKIN_IDS.indexOf(id), sh.position);
      this.stage.add(sh);
      this.shadows.set(id, sh);
    }
    for (const id of s.owned) this.addSkin(id);
    for (const id of [...s.worn]) this.wear(id, true);
    for (let i = 0; i < s.poops; i++) this.spawnPoop(i);
    if (s.hasKey) this.keyToDesk(KEY_REST);
    if (s.keyToday && !s.keyGot && !s.hasKey) this.keyAt = nextDay ? 15 : 60 + Math.random() * 120; // judges skip the wait
    this.tag.set(s.name);
    this.intro = s.first ? 'first' : away >= 1 ? 'sleep' : 'greet';
    if (this.intro === 'sleep') this.setAct('sleep', 9999); // asleep until you show up
    this.zzz.visible = false;
    this.stage.add(this.zzz);
    this.target.copy(HOME);

    for (let i = 0; i < 2; i++) {
      const hand = w.renderer.xr.getHand(i) as unknown as Object3D & { joints: Record<string, Object3D> };
      w.player.add(hand); // joints are local to the XR origin
      const nv = () => new Vector3();
      this.hands.push({
        joints: hand.joints, ok: false, idx: nv(), thumb: nv(), mid: nv(), palm: nv(), pinch: nv(), pIdx: nv(), pMid: nv(),
        vIdx: 0, vMid: 0, palmUp: false, roll: 0, pinching: false, held: null, armedAt: -1, petT: 0, twist0: null, vPinch: nv(), pPinch: nv(),
      });
    }
    const onHide = () => save(this.s);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    this.cleanupFuncs.push(() => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onHide); });
    if (import.meta.env.DEV) (window as any).__pet = this; // test hook
  }

  update(dt: number, time: number) {
    const w = this.world as World;
    const immersive = !String(w.visibilityState).toLowerCase().startsWith('non');
    if (immersive && this.enterAt < 0) { this.enterAt = time; this.placed = false; }
    if (!immersive) this.enterAt = -1;
    if (immersive && !this.placed && time - this.enterAt > 1.5) this.place();
    this.stage.updateMatrixWorld();

    this.st += dt;
    tick(this.s, dt);
    if ((this.saveT += dt) > 30) { this.saveT = 0; save(this.s); }

    for (const h of this.hands) this.readHand(h, dt);
    const wasTouching = this.touching;
    this.touching = false;
    for (const h of this.hands) this.interact(h, dt);
    if (this.touching && !wasTouching) sfx.pick(); // soft squeak on contact
    if (this.placed) {
      this.pt += dt;
      if (this.pt - dt <= 2 && this.pt > 2) this.playIntro(); // 2 s after you arrive
      if (this.intro === 'first' || this.pt > 2) this.script();
    }
    this.updateFoxtail();
    this.updateBall(dt);
    this.animate(dt);
    this.animateProps(dt);
    this.hud.draw(this.s, this.guide());
  }

  // ---------- placement ----------
  /** Put the stage on the real desk in front of the player, or on a floating pedestal when no desk is found. */
  private place() {
    const w = this.world as World;
    this.placed = true;
    const head = w.camera.getWorldPosition(this.v);
    const fwd = w.camera.getWorldDirection(this.v2);
    fwd.y = 0;
    fwd.normalize();
    const tx = head.x + fwd.x * 0.45, tz = head.z + fwd.z * 0.45;
    let best = 0.5, ax = tx, ay = head.y - 0.5, az = tz, desk = false;
    for (const e of this.queries.planes.entities) {
      if (!e.object3D) continue;
      const label = (e.getValue(XRPlane, '_plane') as { semanticLabel?: string } | undefined)?.semanticLabel ?? '';
      const b = this.box.setFromObject(e.object3D);
      const flat = b.max.y - b.min.y < 0.12 && b.max.y > 0.4 && b.max.y < 1.2;
      if (!(label === 'table' || label === 'desk' || (!label && flat))) continue;
      const cx = Math.max(b.min.x, Math.min(b.max.x, tx)), cz = Math.max(b.min.z, Math.min(b.max.z, tz));
      const d = Math.hypot(cx - tx, cz - tz);
      if (d < best) { best = d; ax = cx; az = cz; ay = b.max.y; desk = true; }
    }
    this.pedestal.visible = !desk;
    this.stage.position.set(ax, ay, az);
    this.stage.rotation.y = Math.atan2(head.x - ax, head.z - az);
    this.stage.updateMatrixWorld(true);
    const wp = (p: Vector3, dy = 0) => { const o = this.stage.localToWorld(this.v2.copy(p).setY(p.y + dy)); return `${o.x.toFixed(3)},${o.y.toFixed(3)},${o.z.toFixed(3)}`; };
    console.log(`[pet] placed desk=${desk} basket=${wp(BASKET, 0.05)} mouth=${wp(HOME, 0.11)} trash=${wp(TRASH, 0.12)} chest=${wp(CHEST, 0.06)} key=${wp(KEY_REST)} poop0=${wp(POOP_SPOTS[0], 0.015)} slot0=${wp(slotPos(0, this.v), 0.01)} fox=${wp(FOX_HOME)} ball=${wp(BALL_HOME)} tag=${wp(TAG, 0.05)} hat=${wp(HOME, 0.165)}`);
  }

  // ---------- hands ----------
  private readHand(h: Hand, dt: number) {
    const j = h.joints, idx = j['index-finger-tip'], thumb = j['thumb-tip'], mid = j['middle-finger-tip'], wrist = j['wrist'];
    const was = h.ok;
    h.ok = !!(idx && thumb && mid && wrist && (idx as any).visible !== false);
    if (!h.ok) {
      if (h.held) this.release(h, true); // tracking lost: the item drops where it was, never vanishes
      h.pinching = false;
      return;
    }
    const loc = (o: Object3D, out: Vector3) => this.stage.worldToLocal(o.getWorldPosition(out));
    h.pIdx.copy(h.idx);
    h.pMid.copy(h.mid);
    loc(idx, h.idx); loc(thumb, h.thumb); loc(mid, h.mid);
    loc(j['middle-finger-metacarpal'] ?? wrist, h.palm);
    h.pPinch.copy(h.pinch);
    h.pinch.addVectors(h.idx, h.thumb).multiplyScalar(0.5);
    if (was && dt > 0) {
      h.vPinch.lerp(this.v.subVectors(h.pinch, h.pPinch).divideScalar(dt), 0.5);
      h.vIdx += (h.idx.distanceTo(h.pIdx) / dt - h.vIdx) * 0.5;
      h.vMid += (h.mid.distanceTo(h.pMid) / dt - h.vMid) * 0.5;
    } else { h.vIdx = h.vMid = 0; h.vPinch.set(0, 0, 0); }
    wrist.getWorldQuaternion(this.q);
    h.palmUp = this.v.set(0, -1, 0).applyQuaternion(this.q).y > 0.5; // WebXR: -Y of a hand joint points out of the palm
    this.v.set(1, 0, 0).applyQuaternion(this.q);
    h.roll = Math.atan2(this.v.y, Math.hypot(this.v.x, this.v.z));
  }

  private interact(h: Hand, dt: number) {
    if (!h.ok) return;
    const gap = h.idx.distanceTo(h.thumb);
    const sqPos = this.sq.root.position;
    const headC = this.v.copy(sqPos).setY(sqPos.y + 0.128);
    const near = Math.min(h.idx.distanceTo(headC), h.palm.distanceTo(headC), h.mid.distanceTo(headC),
      h.idx.distanceTo(this.v2.copy(sqPos).setY(sqPos.y + 0.06)), h.palm.distanceTo(this.v2));
    const visible = this.act !== 'fetchHide';

    // a fast hand coming at it: flinch; any hand on it: squish + soft squeak
    if (visible && this.act === 'idle' && near < 0.16 && h.vIdx > 1.2 && this.st - this.flinchAt > 2) {
      this.flinchAt = this.st;
      this.setAct('flinch', 0.5);
      sfx.ouch();
    }
    if (visible && near < PET_R * 0.8) this.touching = true;

    // pinch: pick up / carry / let go
    if (!h.pinching && gap < PINCH_ON) { h.pinching = true; if (!h.held) this.pick(h); }
    else if (h.pinching && gap > PINCH_OFF) { h.pinching = false; if (h.held) this.release(h, false); }
    if (h.held) {
      h.held.obj.position.copy(h.pinch);
      if (h.held.kind === 'foxtail') { // stem points the way the fingers point
        this.fox.quaternion.setFromUnitVectors(this.v2.set(0, 1, 0), this.v3.subVectors(h.idx, h.palm).normalize());
      }
      if (h.held.kind === 'key') { // turn the key at the lock
        if (h.pinch.distanceTo(this.v2.copy(CHEST).setY(0.04)) < 0.12) {
          h.twist0 ??= h.roll;
          if (Math.abs(h.roll - h.twist0) > TWIST) this.openChest(h);
        } else h.twist0 = null;
      }
      return;
    }

    // receive the key on an open palm
    if (this.act === 'offer' && h.palmUp && h.palm.distanceTo(headC) < 0.22) { this.giveKey(h); return; }

    // flick (딱밤): thumb holds the middle finger, then it snaps out near the squirrel
    const tm = h.thumb.distanceTo(h.mid);
    if (tm < FLICK_ARM) h.armedAt = this.st;
    else if (h.armedAt >= 0 && tm > FLICK_OPEN) {
      const hit = this.st - h.armedAt < FLICK_WINDOW && h.vMid > FLICK_SPEED && near < FLICK_R && visible;
      h.armedAt = -1;
      if (hit) { this.onFlick(); h.petT = -1; return; }
    }

    // pet: a slow hand resting on the head or back
    if (visible && !h.pinching && near < PET_R && h.vIdx < PET_SLOW) {
      h.petT += dt;
      if (h.petT > PET_TIME) { h.petT = -0.6; this.onPet(); }
    } else if (h.petT > 0) h.petT = 0;
    else if (h.petT < 0) h.petT = Math.min(0, h.petT + dt);
  }

  private pick(h: Hand) {
    let best = PICK_R, hit: Held | null = null;
    const tryItem = (obj: Object3D | null | undefined, kind: Kind, id?: string, r = 1) => {
      if (!obj) return;
      const d = this.local(obj).distanceTo(h.pinch) / r;
      if (d < best) { best = d; hit = { kind, obj, id }; }
    };
    if (this.keyOn === 'desk') tryItem(this.key, 'key');
    for (const p of this.poops) tryItem(p, 'poop');
    for (const [id, o] of this.skinObj) tryItem(o, 'skin', id);
    if (this.ballOn === 'box' || this.ballOn === 'free') tryItem(this.ball, 'ball');
    if (!hit && h.pinch.distanceTo(this.v2.copy(TAG).setY(0.05)) < 0.045) { // pinch the sign: next name
      this.s.name = NAMES[(NAMES.indexOf(this.s.name) + 1) % NAMES.length];
      this.tag.set(this.s.name);
      this.say(`이름이 '${this.s.name}'(이)가 됐어요`, 2.5);
      sfx.wear();
      this.save();
      return;
    }
    if (!h.held && !this.hands.some((o) => o.held?.kind === 'foxtail')) tryItem(this.fox, 'foxtail', undefined, 1.3);
    if (!hit && h.pinch.distanceTo(this.v2.copy(BASKET).setY(0.04)) < 0.085) {
      const a = makeAcorn();
      this.stage.add(a);
      hit = { kind: 'acorn', obj: a };
    }
    if (!hit) return;
    h.held = hit as Held;
    h.twist0 = null;
    if (h.held.kind === 'key') this.keyOn = 'held';
    if (h.held.kind === 'ball') this.ballOn = 'held';
    if (h.held.kind === 'foxtail') { this.catches = 0; if (this.s.full < 20) this.refuse(); }
    if (h.held.kind === 'poop') this.poops.splice(this.poops.indexOf(h.held.obj), 1);
    if (h.held.id && h.held.id === this.popped) this.popped = null;
    if (h.held.kind === 'skin' && h.held.obj.parent !== this.stage) { // taking a worn skin off
      this.stage.attach(h.held.obj);
      this.s.worn = this.s.worn.filter((id) => id !== h.held!.id);
    }
    sfx.pick();
    console.log(`[pet] pick ${h.held.kind}${h.held.id ? ':' + h.held.id : ''}`);
  }

  private release(h: Hand, lost: boolean) {
    const it = h.held!;
    h.held = null;
    const p = it.obj.position;
    const sqPos = this.sq.root.position;
    const visible = this.act !== 'fetchHide';
    if (it.kind === 'acorn') {
      it.obj.removeFromParent(); // uneaten acorns go back to the basket
      if (!lost && visible && p.distanceTo(this.v2.copy(sqPos).setY(sqPos.y + 0.11)) < FEED_R) this.onFeed();
    } else if (it.kind === 'poop') {
      if (!lost && Math.hypot(p.x - TRASH.x, p.z - TRASH.z) < 0.075) { it.obj.removeFromParent(); this.onClean(); }
      else { p.y = 0; this.poops.push(it.obj); }
    } else if (it.kind === 'key') {
      if (!lost && p.distanceTo(this.v2.copy(CHEST).setY(0.04)) < 0.12) { h.held = it; this.openChest(h); } // letting go at the lock also opens it
      else this.keyToDesk(this.v2.set(p.x, KEY_REST.y, p.z));
    } else if (it.kind === 'foxtail') {
      this.fox.position.copy(FOX_HOME); // back in the toy box
      this.fox.rotation.set(0, 0, 1.2);
    } else if (it.kind === 'ball') {
      this.ballOn = 'free';
      this.ballThrown = !lost;
      this.ballVel.copy(h.vPinch).multiplyScalar(lost ? 0 : THROW_GAIN).clampLength(0, THROW_MAX);
      console.log(`[pet] ball tossed ${this.ballVel.length().toFixed(2)} m/s`);
    } else if (it.kind === 'skin') {
      if (!lost && visible && p.distanceTo(this.v2.copy(sqPos).setY(sqPos.y + 0.1)) < 0.14) this.wear(it.id!);
      else if (it.id === 'goldFur') this.toSlot(it.id); // fur icon dropped elsewhere: just goes home
      else { this.toSlot(it.id!); this.save(); }
    }
  }

  // ---------- reactions ----------
  private setAct(a: Act, dur: number) { this.act = a; this.actDur = dur; this.actEnd = this.st + dur; }
  private say(text: string, dur = 4) { this.flash = text; this.flashEnd = this.st + dur; }
  private busy() { return this.act.startsWith('fetch') || this.act === 'offer' || this.act.startsWith('ball'); }

  private onFeed() {
    if (this.busy()) return;
    if (this.act === 'full' || !feed(this.s)) {
      this.setAct('full', 4);
      sfx.burp();
      this.say('배가 너무 불러요! 꺼억');
    } else {
      this.setAct('eat', 2);
      sfx.eat();
      if (!this.s.first && this.poopAt < 0 && this.s.poops < 3) this.poopAt = this.st + 25 + Math.random() * 20;
      if (this.s.first && this.step === 1) this.next(2);
    }
    console.log(`[pet] feed full=${Math.round(this.s.full)} act=${this.act}`);
  }

  private onPet() {
    pet(this.s);
    if (!this.busy()) this.setAct('happy', 1.5);
    this.spawnHearts();
    sfx.purr();
    if (this.s.first && this.step === 2) this.next(3);
    console.log(`[pet] pet mood=${Math.round(this.s.mood)}`);
  }

  private onFlick() {
    flick(this.s);
    if (!this.busy()) this.setAct('ouch', 1);
    sfx.ouch();
    this.say('아야!', 2);
    console.log(`[pet] flick mood=${Math.round(this.s.mood)}`);
  }

  private onClean() {
    cleanPoop(this.s);
    if (!this.busy()) this.setAct('thank', 1.5);
    sfx.clean();
    if (this.s.first && this.step === 4 && this.s.poops === 0) this.next(5);
    console.log(`[pet] clean poops=${this.s.poops} clean=${Math.round(this.s.clean)}`);
  }

  /** Coming back: a sleeping squirrel wakes up and runs over happily; otherwise a wave hello. */
  private playIntro() {
    if (this.intro === 'sleep') {
      this.setAct('wake', 1.2);
      sfx.key();
      console.log('[pet] wake up');
    } else if (this.intro === 'greet' && this.act === 'idle') this.setAct('greet', 2.5);
  }

  private refuse() { // too hungry to play: points at its belly
    this.setAct('refuse', 2);
    sfx.no();
    this.say('배가 고파서 못 놀겠어요. 밥 먼저 주세요!');
  }

  private onPlay(what: string) {
    if (!play(this.s)) { this.refuse(); return; }
    this.spawnHearts();
    sfx.clean();
    console.log(`[pet] play ${what} mood=${Math.round(this.s.mood)} full=${Math.round(this.s.full)}`);
  }

  /** Foxtail held: the head tracks the seed head; touching it near the head is a catch, 3 catches = happy roll. */
  private updateFoxtail() {
    const held = this.hands.some((h) => h.held?.kind === 'foxtail');
    if (!held) return;
    this.foxTip.set(0, FOXTAIL_LEN, 0);
    this.fox.localToWorld(this.foxTip);
    this.stage.worldToLocal(this.foxTip);
    const root = this.sq.root.position;
    const d = this.v.copy(root).setY(0.125).distanceTo(this.foxTip);
    if (this.s.full < 20 || this.busy() || this.act === 'roll' || this.act === 'refuse') return;
    if (d < CATCH_R && this.st - this.catchAt > 0.9) {
      this.catchAt = this.st;
      this.catches++;
      sfx.pick();
      console.log(`[pet] foxtail catch ${this.catches}`);
      if (this.catches >= 3) { this.catches = 0; this.setAct('roll', 2.2); this.onPlay('foxtail'); }
      else this.setAct('jump', 0.6);
    }
  }

  /** Ball rolls on the desk; when it stops the squirrel fetches it back to you. Off the edge = back to the toy box. */
  private updateBall(dt: number) {
    const b = this.ball.position;
    if (this.ballOn === 'free') {
      this.ballVel.y -= 9.8 * dt;
      b.addScaledVector(this.ballVel, dt);
      const onDesk = Math.hypot(b.x, b.z) < EDGE;
      if (onDesk && b.y < BALL_R) {
        b.y = BALL_R;
        if (this.ballVel.y < -0.3) sfx.pick();
        this.ballVel.y = Math.abs(this.ballVel.y) > 0.3 ? -this.ballVel.y * 0.45 : 0;
        this.ballVel.x *= 1 - Math.min(1, dt * ROLL_DRAG); // rolling friction
        this.ballVel.z *= 1 - Math.min(1, dt * ROLL_DRAG);
        this.ball.rotation.z -= this.ballVel.x * dt / BALL_R;
        this.ball.rotation.x += this.ballVel.z * dt / BALL_R;
      }
      if (b.y < -0.3) { // fell off the desk: the squirrel peeks over the edge, the ball returns to the box
        this.v.set(b.x, 0, b.z).setLength(EDGE - 0.08);
        this.ballHome();
        if (!this.busy()) { this.target.copy(this.v); this.setAct('peek', 3); }
        console.log('[pet] ball fell off the desk');
        return;
      }
      const resting = b.y <= BALL_R + 0.001 && Math.hypot(this.ballVel.x, this.ballVel.z) < 0.04;
      if (resting && this.ballThrown && this.act === 'idle' && this.sq.root.visible) {
        this.ballThrown = false;
        if (this.s.full < 20) { this.refuse(); this.ballHome(); return; }
        this.ballVel.set(0, 0, 0);
        this.target.set(b.x, 0, b.z).addScaledVector(this.v.set(-b.x, 0, -b.z).normalize(), 0.03);
        this.setAct('ballGo', 99);
      }
    }
  }

  private ballHome() { this.ball.removeFromParent(); this.stage.add(this.ball); this.ball.position.copy(BALL_HOME); this.ballVel.set(0, 0, 0); this.ballOn = 'box'; }

  private spawnPoop(i = this.poops.length) {
    const p = makePoop();
    p.position.copy(POOP_SPOTS[i % 3]);
    this.stage.add(p);
    this.poops.push(p);
  }
  private doPoop() {
    if (this.s.poops >= 3) return;
    addPoop(this.s);
    this.spawnPoop();
    sfx.poop();
    console.log(`[pet] poop poops=${this.s.poops}`);
  }

  private spawnHearts() {
    const c = this.sq.root.position;
    this.hearts.forEach((h, i) => {
      h.t = -i * 0.08;
      h.m.position.set(c.x + Math.sin(i * 2.4) * 0.04, c.y + 0.17, c.z + Math.cos(i * 2.4) * 0.03);
    });
  }

  // ---------- key, chest, skins ----------
  private startFetch() {
    this.key ??= makeKey();
    this.setAct('fetchGo', 99);
    this.target.copy(HOLE);
    console.log('[pet] key: fetching');
  }

  private giveKey(h: Hand) {
    this.keyOn = 'palm';
    this.keyHand = h;
    this.keyPalmT = 1.2;
    this.stage.add(this.key!);
    this.s.hasKey = this.s.keyGot = true;
    this.setAct('happy', 1.5);
    this.target.copy(HOME);
    sfx.key();
    if (this.s.first) this.next(6);
    save(this.s);
    console.log('[pet] key: received on palm');
  }

  private keyToDesk(p: Vector3) {
    this.key ??= makeKey();
    this.stage.add(this.key);
    this.key.position.copy(p);
    this.key.rotation.set(Math.PI / 2, 0, 0);
    this.keyOn = 'desk';
  }

  private openChest(h: Hand) {
    h.held = null;
    h.twist0 = null;
    this.key?.removeFromParent();
    this.keyOn = null;
    this.s.hasKey = false;
    this.lidCloseAt = this.st + 4;
    sfx.chest();
    const id = drawSkin(this.s.owned);
    if (id) {
      this.s.owned.push(id);
      this.addSkin(id).position.set(CHEST.x, 0.12, CHEST.z);
      this.popped = id;
      this.say(`${SKINS.find((k) => k.id === id)!.name}이(가) 나왔어요! 집어서 다람쥐에게 입혀 주세요`, 8);
    }
    if (this.s.first) this.next(7);
    save(this.s);
    console.log(`[pet] chest opened skin=${id}`);
  }

  private addSkin(id: string) {
    const def = SKINS.find((k) => k.id === id);
    if (!def) return new Group();
    const o = def.make();
    this.shadows.get(id)?.removeFromParent();
    this.shadows.delete(id);
    slotPos(SKIN_IDS.indexOf(id), o.position);
    this.stage.add(o);
    this.skinObj.set(id, o);
    return o;
  }

  /** Wear a skin: one per body slot (hat, neck, face, back); gold fur toggles the coat colour. */
  private wear(id: string, quiet = false) {
    const def = SKINS.find((k) => k.id === id), o = this.skinObj.get(id);
    if (!def || !o) return;
    if (def.slot === 'fur') {
      const on = quiet || !this.s.worn.includes(id);
      setGoldFur(on);
      this.s.worn = this.s.worn.filter((w) => w !== id);
      if (on) this.s.worn.push(id);
      this.toSlot(id);
    } else {
      for (const w of this.s.worn) { // the skin already in that slot goes back to the wardrobe
        if (w !== id && SKINS.find((k) => k.id === w)?.slot === def.slot) this.toSlot(w);
      }
      this.s.worn = this.s.worn.filter((w) => w !== id && SKINS.find((k) => k.id === w)?.slot !== def.slot);
      this.s.worn.push(id);
      const sq = this.sq;
      ({ hat: sq.hatSlot, neck: sq.neckSlot, face: sq.faceSlot, back: sq.backSlot } as Record<string, Object3D>)[def.slot].add(o);
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
    }
    if (id === this.popped) this.popped = null;
    if (quiet) return;
    this.setAct('spin', 1.6);
    sfx.wear();
    if (this.s.first && this.step === 7) { this.s.first = false; this.step = 8; this.say('다람쥐는 가끔 새 열쇠를 물고 와요. 내일 또 만나요!', 20); }
    this.save();
    console.log(`[pet] wear ${id} worn=${this.s.worn.join(',')}`);
  }

  /** Put a skin back in its wardrobe slot. */
  private toSlot(id: string) {
    const o = this.skinObj.get(id);
    if (!o) return;
    this.stage.add(o);
    o.rotation.set(0, 0, 0);
    slotPos(SKIN_IDS.indexOf(id), o.position);
  }

  private local(o: Object3D) { return o.parent === this.stage ? o.position : this.stage.worldToLocal(o.getWorldPosition(this.v3)); }
  private save() { save(this.s); }

  // ---------- pacing ----------
  private next(step: number) { this.step = step; this.stepAt = this.st; }

  /** First visit: the whole loop in order (PRD "처음 5분"). Later visits: real time + random key. */
  private script() {
    const s = this.s, idle = this.act === 'idle';
    if (s.first) {
      const since = this.st - this.stepAt;
      if (this.step === 0 && this.pt > 2 && idle && since > 2) { this.setAct('greet', 2.5); this.stepAt = this.st + 99; }
      if (this.step === 0 && this.pt > 12) { s.full = Math.min(s.full, 20); this.next(1); }
      if (this.step === 3 && since > 6 && idle) { this.doPoop(); this.next(4); }
      if (this.step === 5 && since > 4 && idle) { this.startFetch(); this.stepAt = this.st + 999; }
    } else {
      if (this.poopAt > 0 && this.st > this.poopAt && idle) { this.poopAt = -1; this.doPoop(); }
      if (this.keyAt > 0 && this.pt > this.keyAt && s.mood >= 50 && idle && drawSkin(s.owned)) { this.keyAt = -1; this.startFetch(); }
    }
  }

  private guide() {
    const s = this.s;
    if (this.st < this.flashEnd) return this.flash;
    if (this.act === 'offer') return '열쇠를 물고 왔어요! 손바닥을 펴서 내밀어 보세요';
    if (this.keyOn === 'desk' || this.keyOn === 'held' || this.keyOn === 'palm') return '열쇠를 집어 상자 자물쇠에 대고 손목을 돌리세요';
    if (this.popped) return '상자에서 나온 스킨을 집어 다람쥐에게 입혀 주세요';
    if (s.first) {
      return ['다람쥐가 인사해요!', '배가 고픈가 봐요. 도토리를 집어서 줘 보세요', '잘 먹었어요! 이번엔 쓰다듬어 보세요', '좋아해요!',
        '똥을 집어서 쓰레기통에 버려 주세요', '깨끗해졌어요!', '', '', ''][this.step] ?? '';
    }
    if (s.full < 30) return '배고파해요. 도토리를 집어서 주세요';
    if (s.poops > 0) return '똥을 집어서 쓰레기통에 버려 주세요';
    if (s.mood < 50) return '시무룩해요. 쓰다듬어 주세요';
    return s.keyToday && !s.keyGot ? '기분이 좋아 보여요. 뭔가 가져올지도 몰라요' : '오늘도 와 줘서 고마워요!';
  }

  // ---------- animation (all poses are code-driven) ----------
  private animate(dt: number) {
    const q = this.sq, t = this.st, s = this.s, root = q.root;
    if (this.act !== 'idle' && t > this.actEnd) {
      if (this.act === 'ouch') this.setAct('sulk', 3);
      else if (this.act === 'wake') { this.target.copy(FRONT); this.setAct('greet', 3); }
      else if (this.act === 'offer') { this.keyToDesk(this.v.copy(root.position).add(this.v2.set(0.06, KEY_REST.y, 0.05))); this.s.hasKey = this.s.keyGot = true; this.act = 'idle'; this.target.copy(HOME); if (s.first) this.next(6); }
      else { if (this.act === 'peek' || this.act === 'greet' || this.act === 'beg') this.target.copy(HOME); this.act = 'idle'; }
    }
    const a = this.act;

    // walk toward the target with little hops
    const dx = this.target.x - root.position.x, dz = this.target.z - root.position.z, dist = Math.hypot(dx, dz);
    let yawTo = 0, hop = 0;
    if (dist > 0.004) {
      const step = Math.min(dist, WALK * dt);
      root.position.x += (dx / dist) * step;
      root.position.z += (dz / dist) * step;
      yawTo = Math.atan2(dx, dz);
      hop = Math.abs(Math.sin(t * 16)) * 0.012;
    } else if (a === 'fetchGo') { this.setAct('fetchHide', 1.6); }
    else if (a === 'fetchBack') { this.setAct('offer', 15); }
    else if (a === 'ballGo') { // pick the ball up in the mouth and bring it to you
      q.mouth.add(this.ball);
      this.ball.position.set(0, 0, 0.012);
      this.ballOn = 'mouth';
      this.target.copy(FRONT);
      this.setAct('ballBack', 99);
    } else if (a === 'ballBack') { // drop it in front of you and wait for another throw
      this.stage.add(this.ball);
      this.ball.position.set(root.position.x, BALL_R, root.position.z + 0.05);
      this.ballOn = 'free';
      this.ballVel.set(0, 0, 0.0001);
      this.setAct('beg', 4);
      this.onPlay('ball');
    }
    if (a === 'fetchHide' && t > this.actEnd - 0.05) { // comes back out with the key in its mouth
      q.mouth.add(this.key!);
      this.key!.position.set(0, 0, 0.008);
      this.key!.rotation.set(0, 0, Math.PI / 2);
      this.keyOn = 'mouth';
      sfx.key();
      this.setAct('fetchBack', 99);
      this.target.copy(FRONT);
    }

    // rest pose
    const breath = 1 + Math.sin(t * 2.2) * 0.025;
    q.body.scale.set(1.05, 1.1 * breath, 0.95);
    q.belly.scale.set(1, 1.05, 0.8);
    q.head.rotation.set(0, 0, 0);
    q.head.position.z = 0.004;
    q.armL.rotation.set(-0.9, 0, 0.15); // paws held up in front
    q.armR.rotation.set(-0.9, 0, -0.15);
    q.tail.rotation.set(Math.sin(t * 1.3) * 0.05, 0, 0);
    q.cheekL.scale.setScalar(1);
    q.cheekR.scale.setScalar(1);
    root.rotation.x = 0;
    root.scale.set(1, 1, 1);
    root.visible = a !== 'fetchHide';
    let eyes: 'open' | 'happy' | 'ouch' = 'open';

    if (a === 'idle') {
      if (s.full < 30) { // hungry: rub the belly, droop the tail
        q.armR.rotation.set(-0.9, 0, -0.5 + Math.sin(t * 6) * 0.25);
        q.tail.rotation.x = -0.5;
        q.head.rotation.z = 0.15;
      } else if (s.poops > 0) { // hold the nose
        q.armL.rotation.x = -2.1;
        q.head.rotation.y = 0.3;
      } else if (s.mood < 30) { // gloomy
        q.tail.rotation.x = -0.6;
        q.head.rotation.x = 0.25;
      } else this.lookAtHand();
    } else if (a === 'greet') {
      q.armR.rotation.z = 2.5 + Math.sin(t * 12) * 0.35;
      eyes = 'happy';
      hop = Math.abs(Math.sin(t * 9)) * 0.01;
    } else if (a === 'eat') {
      q.armL.rotation.x = q.armR.rotation.x = -1.3;
      const puff = 1.5 + Math.sin(t * 16) * 0.1;
      q.cheekL.scale.setScalar(puff);
      q.cheekR.scale.setScalar(puff);
      q.head.rotation.x = Math.sin(t * 16) * 0.12;
    } else if (a === 'full' || a === 'sleep') { // flop on the back
      root.rotation.x = -1.15;
      if (a === 'full') q.belly.scale.set(1.35, 1.3, 1.3);
      q.armL.rotation.z = -1.2;
      q.armR.rotation.z = 1.2;
      eyes = 'happy';
    } else if (a === 'happy' || a === 'offer') {
      eyes = 'happy';
      q.tail.rotation.z = Math.sin(t * 14) * 0.35;
      q.head.rotation.z = Math.sin(t * 5) * 0.1;
      if (a === 'offer') hop = Math.abs(Math.sin(t * 6)) * 0.008; else root.scale.y = 0.96; // pressed a little under the hand
    } else if (a === 'ouch') { // cartoon squash, hands on the head, puffed cheeks
      const p = 1 - (this.actEnd - t) / this.actDur;
      root.scale.y = 0.6 + 0.4 * Math.min(1, p * 3);
      q.armL.rotation.z = -2.6;
      q.armR.rotation.z = 2.6;
      q.cheekL.scale.setScalar(1.4);
      q.cheekR.scale.setScalar(1.4);
      eyes = 'ouch';
    } else if (a === 'sulk') { // turn the back, droop the tail
      yawTo = Math.PI;
      q.tail.rotation.x = -0.6;
      q.cheekL.scale.setScalar(1.3);
      q.cheekR.scale.setScalar(1.3);
    } else if (a === 'thank') { // clap
      const c = 0.2 + Math.abs(Math.sin(t * 14)) * 0.5;
      q.armL.rotation.set(-1.3, 0, c);
      q.armR.rotation.set(-1.3, 0, -c);
      eyes = 'happy';
    } else if (a === 'spin') { hop = Math.abs(Math.sin(t * 8)) * 0.015; eyes = 'happy'; }
    else if (a === 'wake') { // sits up, stretches
      q.armL.rotation.set(-2.8, 0, 0.3);
      q.armR.rotation.set(-2.8, 0, -0.3);
      root.scale.y = 1.08;
    } else if (a === 'flinch') { // a fast hand: jumps back a little
      root.rotation.x = -0.35;
      q.armL.rotation.set(-1.8, 0, 0.6);
      q.armR.rotation.set(-1.8, 0, -0.6);
      eyes = 'ouch';
    }
    else if (a === 'jump') { // leap at the foxtail, paws up
      const p = 1 - (this.actEnd - t) / this.actDur;
      hop = Math.sin(p * Math.PI) * 0.05;
      q.armL.rotation.set(-2.6, 0, 0.2);
      q.armR.rotation.set(-2.6, 0, -0.2);
      eyes = 'happy';
    } else if (a === 'roll') { // happy roll on the desk
      root.rotation.x = 0;
      root.rotation.z = (1 - (this.actEnd - t) / this.actDur) * Math.PI * 4;
      eyes = 'happy';
    } else if (a === 'beg' || a === 'ballBack' || a === 'ballGo') {
      q.tail.rotation.z = Math.sin(t * 14) * 0.3;
      if (a === 'beg') { q.armL.rotation.x = q.armR.rotation.x = -1.6; hop = Math.abs(Math.sin(t * 7)) * 0.006; }
    } else if (a === 'peek') {
      q.head.rotation.x = 0.6; // looking down over the edge
    } else if (a === 'refuse') {
      q.armR.rotation.set(-0.9, 0, -0.5 + Math.sin(t * 6) * 0.25); // rubs the belly
      q.head.rotation.z = Math.sin(t * 4) * 0.2;
    }
    if (a !== 'roll') root.rotation.z = 0;
    if (this.touching && (a === 'idle' || a === 'happy')) root.scale.y = 0.93; // squished a little under your hand
    this.zzz.visible = a === 'sleep';
    if (this.zzz.visible) this.zzz.position.set(root.position.x + 0.03, 0.11 + Math.sin(t * 2) * 0.01, root.position.z);
    if (a === 'idle' && this.hands.some((h) => h.held?.kind === 'foxtail') && this.s.full >= 20) { // eyes on the seed head, ready to pounce
      this.lookAtPoint(this.foxTip);
      if (this.foxTip.distanceTo(this.v.copy(root.position).setY(0.13)) < 0.16) { q.armL.rotation.x = q.armR.rotation.x = -2.2; root.scale.y = 1.06; }
    }

    if (a === 'spin') this.yaw += dt * 8;
    else {
      let d = yawTo - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d)); // shortest way round
      this.yaw += d * Math.min(1, dt * 8);
    }
    root.rotation.y = this.yaw;
    root.position.y = hop;
    q.eyeOpen.visible = eyes === 'open';
    q.eyeHappy.visible = eyes === 'happy';
    q.eyeOuch.visible = eyes === 'ouch';
  }

  /** Idle: the head follows the nearest hand. */
  private lookAtHand() {
    let best = 0.45, hit: Hand | null = null;
    const root = this.sq.root;
    for (const h of this.hands) {
      if (!h.ok) continue;
      const d = h.idx.distanceTo(root.position);
      if (d < best) { best = d; hit = h; }
    }
    if (!hit) return;
    this.lookAtPoint(hit.idx);
    if (best < 0.13 && hit.vIdx < 0.3) this.sq.head.position.z = 0.004 + Math.abs(Math.sin(this.st * 9)) * 0.008; // sniff sniff
  }

  private lookAtPoint(p: Vector3) {
    const root = this.sq.root;
    const dx = p.x - root.position.x, dy = p.y - 0.128, dz = p.z - root.position.z;
    const yaw = Math.atan2(dx, dz) - this.yaw;
    this.sq.head.rotation.y = Math.max(-0.7, Math.min(0.7, Math.atan2(Math.sin(yaw), Math.cos(yaw))));
    this.sq.head.rotation.x = Math.max(-0.4, Math.min(0.3, -Math.atan2(dy, Math.hypot(dx, dz))));
  }

  private animateProps(dt: number) {
    const t = this.st;
    for (const h of this.hearts) {
      h.t += dt;
      const on = h.t > 0 && h.t < 0.9;
      h.m.visible = on;
      if (on) { h.m.position.y += dt * 0.12; h.m.scale.setScalar(1.2 - h.t); }
    }
    const lid = this.chest.lid;
    lid.rotation.x += ((t < this.lidCloseAt ? -1.3 : 0) - lid.rotation.x) * Math.min(1, dt * 6);
    if (this.popped) { // new skin floats over the chest until it is picked
      const o = this.skinObj.get(this.popped)!;
      o.position.y = 0.12 + Math.sin(t * 3) * 0.008;
      o.rotation.y += dt * 1.5;
    }
    if (this.key && this.keyOn === 'desk') this.key.rotation.z += dt * 1.2; // glint so it is easy to spot
    if (this.key && this.keyOn === 'palm') {
      const h = this.keyHand!;
      if (h.ok) this.key.position.copy(h.palm).setY(h.palm.y + 0.02);
      if ((this.keyPalmT -= dt) < 0 || !h.ok) this.keyToDesk(KEY_REST);
    }
  }
}
