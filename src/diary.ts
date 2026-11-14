// VR Diary (design: "VR 다이어리 Flows"): diary + calendar on the real desk, a 3-step record, 2.5D memories.
// Everything lives under `stage` (origin = desk surface in front of the player, +Z toward the player).
import {
  BackSide,
  Box3,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
  XRPlane,
  createSystem,
  type World,
} from '@iwsdk/core';
import { padOff, padOn, sfx } from './audio.js';
import { addDays, allEntries, clearAll, dayKey, patchEntry, type Entry } from './db.js';
import { Panel } from './panel.js';
import { makePhoto3D } from './photo3d.js';
import { SAMPLES, drawSample } from './samples.js';

export const MOODS = [
  { name: 'Joy', color: '#ffd60a' },
  { name: 'Excited', color: '#ff375f' },
  { name: 'Calm', color: '#66d4cf' },
  { name: 'Sad', color: '#0a84ff' },
  { name: 'Tired', color: '#bf5af2' },
];
const SUGGEST = ['Good day.', 'Great food.', 'Saw friends.', 'Rested well.'];
const KEYS = ['qwertyuiop', 'asdfghjkl\'', 'zxcvbnm,.!'];
const MEMO_MAX = 60;
const WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DIM = '#ffffffb3';

// ---- layout (stage-local metres) ----
const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
const DIARY = V(-0.215, 0.2, -0.07), CAL = V(0.075, 0.2, -0.1);
const ORBS_Y = 0.32, MOODP = V(0, 0.19, -0.09);
const MEMOP = V(0, 0.29, -0.1), KEYB = V(0, 0.115, -0.01);
const CARDP = V(-0.135, 0.225, -0.06), TODAYP = V(0.1, 0.22, -0.08);
const FRAME = V(0, 0.3, -0.09), MEMCARD = V(0, 0.125, -0.04);
const orbHome = (i: number, out: Vector3) => out.set((i - 2) * 0.065, ORBS_Y, -0.09);
const FRAME_W = 0.3, INSIDE = 3.5;

// ---- tuning (adjust on the headset) ----
const PINCH_ON = 0.02, PINCH_OFF = 0.045; // thumb-index gap
const ORB_R = 0.05; // pinch this close to an orb to take it
const SWIPE = 0.08, SWIPE_V = 0.45; // metres of fast vertical travel in front of the calendar = one month
const PUSH_V = 0.6; // m/s palm push toward the photo closes it
const POKE_IN = 0.008, POKE_OUT = 0.025; // keyboard: fingertip within / back out of the key plane

type Img = OffscreenCanvas;
type Day = { e: Entry; photo?: Img; depth?: Img };
type Mode = 'desk' | 'record' | 'memory';
type Hand = {
  joints: Record<string, Object3D>; ok: boolean;
  idx: Vector3; thumb: Vector3; palm: Vector3; pinch: Vector3; prevPalm: Vector3; vel: Vector3; normal: Vector3;
  pinching: boolean; orb: number; card: boolean; onFrame: boolean; pokeArmed: boolean; swipe: number; inCal: boolean;
};

const toCanvas = (b: ImageBitmap) => { const c = new OffscreenCanvas(b.width, b.height); c.getContext('2d')!.drawImage(b, 0, 0); return c; };
async function fileImg(url: string) {
  const r = await fetch(url);
  if (!r.ok || !r.headers.get('content-type')?.startsWith('image')) throw new Error(url);
  return toCanvas(await createImageBitmap(await r.blob()));
}
const sampleImgs = new Map<number, Promise<{ photo: Img; depth: Img }>>();
function sampleImages(i: number) { // a real photo in public/samples if there is one, else the drawn scene
  if (!sampleImgs.has(i)) {
    const n = String(i + 1).padStart(2, '0'), base = `${import.meta.env.BASE_URL}samples/${n}`;
    sampleImgs.set(i, Promise.all([fileImg(`${base}.jpg`), fileImg(`${base}-depth.png`)])
      .then(([photo, depth]) => ({ photo, depth }))
      .catch(() => drawSample(SAMPLES[i])));
  }
  return sampleImgs.get(i)!;
}
const mmdd = (k: string) => { const [, m, d] = k.split('-'); return `${MONTHS[+m - 1].slice(0, 3)} ${+d}`; };
const weekday = (k: string) => { const [y, m, d] = k.split('-'); return WEEK[new Date(+y, +m - 1, +d).getDay()]; };

export class DiarySystem extends createSystem({ planes: { required: [XRPlane] } }) {
  private stage = new Group();
  private pedestal = new Mesh(new CylinderGeometry(0.42, 0.42, 0.02, 40), new MeshPhongMaterial({ color: 0xe9dcc6 }));
  private diary = new Panel(0.16, 0.19);
  private cal = new Panel(0.3, 0.27);
  private guide = new Panel(0.5, 0.04);
  private moodP = new Panel(0.28, 0.17);
  private memoP = new Panel(0.36, 0.175);
  private keyb = new Panel(0.36, 0.14, 2200);
  private card = new Panel(0.16, 0.15); // today's photo, to drop on the page
  private todayP = new Panel(0.22, 0.175);
  private mem = new Panel(0.3, 0.1);
  private arrowL = new Panel(0.04, 0.04);
  private arrowR = new Panel(0.04, 0.04);
  private chip = new Panel(0.36, 0.06); // sound chip on the big photo (frame-local, width 1 = photo width)
  private orbs: Mesh[] = [];
  private frame = new Group();
  private photo: Mesh | null = null;
  private dim = new Mesh(new SphereGeometry(3, 24, 16), new MeshBasicMaterial({ color: 0, transparent: true, opacity: 0, side: BackSide, depthWrite: false }));
  private hands: Hand[] = [];
  private days = new Map<string, Day>();
  private own = new Set<string>(); // days you finished yourself
  private today = dayKey(new Date());
  private mode: Mode = 'desk';
  private rec = 0; // record step: 0 mood, 1 memo, 2 photo
  private placedPhoto = false;
  private month = 0; // months from the current one
  private openDay: string | null = null;
  private openT = 0; // 0 closed .. 1 open
  private scale = 1;
  private target = 1; // scale the photo eases to
  private grab: { d0: number; s0: number } | null = null;
  private typed: string[] = [];
  private first = !localStorage.getItem('vrdiary.visited');
  private step = 0; // first visit: 0 open a date, 1 swipe, 2 record today
  private stepAt = 0;
  private memory: { date: string; label: string } | null = null; // last week / a year ago today
  private placed = false;
  private enterAt = -1;
  private t = 0;
  private swipeAt = 0;
  private blink = false;
  private listening = false;
  private guideInside = false;
  private box = new Box3();
  private v = new Vector3();
  private v2 = new Vector3();
  private q = new Quaternion();

  init() {
    const w = this.world as World;
    w.scene.add(new HemisphereLight(0xffffff, 0x9a8a7a, 1.6)); // passthrough has no lights of its own
    const sun = new DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.4, 1, 0.6);
    w.scene.add(sun);

    this.stage.position.set(0, 1.0, -0.45);
    w.createTransformEntity(this.stage);
    this.pedestal.position.set(0, -0.011, -0.02);
    this.pedestal.visible = false;
    const put = (o: Object3D, p: Vector3, rx = 0, ry = 0) => { o.position.copy(p); o.rotation.set(rx, ry, 0); this.stage.add(o); return o; };
    put(this.pedestal, this.pedestal.position);
    put(this.diary.mesh, DIARY, -0.12, 0.3);
    put(this.cal.mesh, CAL, -0.12);
    this.stage.add(this.guide.mesh);
    put(this.moodP.mesh, MOODP, -0.15);
    put(this.memoP.mesh, MEMOP, -0.15);
    put(this.keyb.mesh, KEYB, -0.6);
    put(this.card.mesh, CARDP, -0.12, 0.15).rotation.z = 0.06;
    put(this.todayP.mesh, TODAYP, -0.12, -0.12);
    put(this.mem.mesh, MEMCARD, -0.3);
    put(this.arrowL.mesh, V(-0.21, FRAME.y, FRAME.z));
    put(this.arrowR.mesh, V(0.21, FRAME.y, FRAME.z));
    for (const [p, s] of [[this.arrowL, '←'], [this.arrowR, '→']] as const) { p.begin(); p.button(s === '←' ? 'prev' : 'next', 0, 0, p.W, p.H); p.text(s, p.W / 2, p.H / 2, 72, '#fff', 'center', 'bold'); p.done(); }
    put(this.frame, FRAME);
    this.chip.mesh.position.set(0.3, 0.33, 0.02);
    this.frame.add(this.chip.mesh);
    this.dim.renderOrder = -1;
    this.stage.add(this.dim);
    MOODS.forEach((m, i) => {
      const orb = new Mesh(new SphereGeometry(0.022, 32, 20), new MeshPhongMaterial({ color: m.color, emissive: m.color, emissiveIntensity: 0.25, shininess: 80 }));
      const label = new Panel(0.05, 0.016);
      label.begin();
      label.text(m.name, label.W / 2, label.H / 2, 28, '#fff', 'center', 'bold');
      label.done();
      label.mesh.position.set(0, -0.035, 0);
      orb.add(label.mesh);
      put(orb, orbHome(i, this.v));
      this.orbs.push(orb);
    });

    for (let i = 0; i < 2; i++) {
      const hand = w.renderer.xr.getHand(i) as unknown as Object3D & { joints: Record<string, Object3D> };
      w.player.add(hand); // joints are local to the XR origin
      const nv = () => new Vector3();
      this.hands.push({ joints: hand.joints, ok: false, idx: nv(), thumb: nv(), palm: nv(), pinch: nv(), prevPalm: nv(), vel: nv(), normal: nv(),
        pinching: false, orb: -1, card: false, onFrame: false, pokeArmed: true, swipe: 0, inCal: false });
    }
    window.addEventListener('diary:changed', this.reload);
    this.cleanupFuncs.push(() => window.removeEventListener('diary:changed', this.reload));
    this.setMode('desk');
    void this.start();
    if (import.meta.env.DEV) (window as any).__diary = this; // test hook
  }

  private async start() {
    const url = new URL(location.href);
    if (url.searchParams.has('reset')) { // judges: start over
      await clearAll();
      localStorage.removeItem('vrdiary.visited');
      this.first = true;
      url.searchParams.delete('reset');
      history.replaceState(null, '', url);
    }
    await this.reload();
  }

  /** Samples fill the 12 days before today; saved days (IndexedDB) win over them. */
  private reload = async () => {
    const now = new Date();
    this.days.clear();
    SAMPLES.forEach((s, i) => { const date = dayKey(addDays(now, -s.ago)); this.days.set(date, { e: { date, mood: s.mood, memo: s.memo, sample: i, done: true } }); });
    const saved = await allEntries();
    for (const e of saved) this.days.set(e.date, { e });
    this.own = new Set(saved.filter((e) => e.done).map((e) => e.date));
    await Promise.all([...this.days.values()].map((d) => this.loadImages(d)));
    const year = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    this.memory = [{ date: dayKey(addDays(now, -7)), label: 'A week ago today' }, { date: dayKey(year), label: 'A year ago today' }].find((m) => this.days.get(m.date)?.e.done) ?? null;
    this.drawAll();
  };

  private async loadImages(d: Day) {
    const e = d.e;
    if (e.photo) {
      d.photo = toCanvas(await createImageBitmap(e.photo));
      if (e.depth) d.depth = toCanvas(await createImageBitmap(e.depth));
      else { d.depth = new OffscreenCanvas(4, 4); const g = d.depth.getContext('2d')!; g.fillStyle = '#808080'; g.fillRect(0, 0, 4, 4); } // flat until depth exists
    } else if (e.sample !== undefined) Object.assign(d, await sampleImages(e.sample));
  }

  private get todayE() { return this.days.get(this.today)?.e; }
  private recorded(k: string) { return !!this.days.get(k)?.e.done; }

  update(dt: number, time: number) {
    const w = this.world as World;
    this.t = time;
    const immersive = !String(w.visibilityState).toLowerCase().startsWith('non');
    if (immersive && this.enterAt < 0) { this.enterAt = time; this.placed = false; }
    if (!immersive) this.enterAt = -1;
    if (immersive && !this.placed && time - this.enterAt > 1.5) this.place();
    this.stage.updateMatrixWorld();

    for (const h of this.hands) this.readHand(h, dt);
    for (const h of this.hands) this.interact(h, dt);
    this.twoHands();
    this.animate(dt);
    const blink = this.mode === 'desk' && !this.recorded(this.today) && (!this.first || this.step >= 2) && Math.floor(time * 2) % 2 === 0;
    if (blink !== this.blink) { this.blink = blink; this.drawCal(); }
  }

  // ---------- placement ----------
  /** Put the stage on the real desk in front of the player, or on a floating disc at desk height when no desk is found. */
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
    this.stepAt = this.t;
    console.log(`[diary] placed desk=${desk}`);
  }

  // ---------- hands ----------
  private readHand(h: Hand, dt: number) {
    const j = h.joints, idx = j['index-finger-tip'], thumb = j['thumb-tip'], wrist = j['wrist'];
    const was = h.ok;
    h.ok = !!(idx && thumb && wrist && (idx as any).visible !== false);
    if (!h.ok) { this.letGo(h); h.pinching = h.onFrame = false; return; }
    idx.getWorldPosition(h.idx);
    thumb.getWorldPosition(h.thumb);
    h.prevPalm.copy(h.palm);
    (j['middle-finger-metacarpal'] ?? wrist).getWorldPosition(h.palm);
    h.pinch.addVectors(h.idx, h.thumb).multiplyScalar(0.5);
    if (was && dt > 0) h.vel.lerp(this.v.subVectors(h.palm, h.prevPalm).divideScalar(dt), 0.4);
    else h.vel.set(0, 0, 0);
    wrist.getWorldQuaternion(this.q);
    h.normal.set(0, -1, 0).applyQuaternion(this.q); // WebXR: -Y of a hand joint points out of the palm
  }

  private interact(h: Hand, dt: number) {
    if (!h.ok) return;
    const gap = h.idx.distanceTo(h.thumb);
    if (!h.pinching && gap < PINCH_ON) { h.pinching = true; this.pinchStart(h); }
    else if (h.pinching && gap > PINCH_OFF) { h.pinching = false; h.onFrame = false; this.letGo(h); }
    const held = h.orb >= 0 ? this.orbs[h.orb] : h.card ? this.card.mesh : null;
    if (held) { held.position.copy(this.stage.worldToLocal(this.v.copy(h.pinch))); return; }

    // keyboard: poke a key with the fingertip
    if (this.keyb.mesh.visible) {
      const f = this.keyb.front(h.idx), id = this.keyb.hit(h.idx, 0.03);
      if (h.pokeArmed && id && f < POKE_IN) { h.pokeArmed = false; this.tap(id); }
      else if (f > POKE_OUT || id === null) h.pokeArmed = true;
    }

    // swipe up/down in front of the calendar = next/previous month
    const inCal = !h.pinching && this.mode === 'desk' && this.cal.hit(h.palm, 0.18) !== null && this.cal.front(h.palm) > 0;
    if (inCal && h.inCal) { // only a hand already in front of the calendar, not one arriving there
      if (Math.abs(h.vel.y) > SWIPE_V) h.swipe += h.vel.y * dt; else h.swipe *= 0.85;
      if (Math.abs(h.swipe) > SWIPE && this.t - this.swipeAt > 0.8) {
        this.swipeAt = this.t;
        this.turnMonth(h.swipe > 0 ? 1 : -1);
        h.swipe = 0;
      }
    } else h.swipe = 0;
    h.inCal = inCal;

    // open palm pushed toward the photo = put it back
    if (this.mode === 'memory' && this.openT > 0.9 && !h.pinching && !this.grab) {
      const fwd = this.v.set(0, 0, -1).applyQuaternion(this.stage.quaternion);
      const near = h.palm.distanceTo(this.frame.getWorldPosition(this.v2)) < 0.3 * this.scale;
      if (near && h.normal.dot(fwd) > 0.6 && h.vel.dot(fwd) > PUSH_V) this.closeDate();
    }
  }

  private pinchStart(h: Hand) {
    for (const p of [this.keyb, this.memoP, this.moodP, this.todayP, this.mem, this.arrowL, this.arrowR, this.diary, this.cal, this.card]) {
      const id = p.hit(h.pinch);
      if (id) { this.tap(id); return; }
      if (id === '' && p === this.card) { h.card = true; sfx.pick(); return; } // pick up today's photo
      if (id === '') return; // on a panel, between buttons
    }
    if (this.mode === 'memory' && this.openT > 0.9 && h.pinch.distanceTo(this.frame.getWorldPosition(this.v)) < 0.25 * this.scale) { h.onFrame = true; return; }
    if (!(this.mode === 'record' && this.rec === 0)) return;
    let best = ORB_R;
    this.orbs.forEach((o, i) => { const d = h.pinch.distanceTo(o.getWorldPosition(this.v)); if (d < best && !this.hands.some((x) => x.orb === i)) { best = d; h.orb = i; } });
    if (h.orb >= 0) sfx.pick();
  }

  private twoHands() {
    const [a, b] = this.hands;
    if (!(a.onFrame && b.onFrame && a.pinching && b.pinching)) { this.grab = null; return; }
    const d = a.pinch.distanceTo(b.pinch);
    this.grab ??= { d0: d, s0: this.scale };
    this.target = this.scale = Math.min(4, Math.max(1, this.grab.s0 * d / this.grab.d0));
  }

  /** Let go of an orb (on the mood card = today's mood) or the photo card (on the page = placed). */
  private letGo(h: Hand) {
    if (h.orb >= 0) {
      const i = h.orb, o = this.orbs[i];
      h.orb = -1;
      const onCard = this.moodP.hit(o.getWorldPosition(this.v), 0.08) !== null;
      orbHome(i, o.position);
      if (onCard) { sfx.drop(); void this.saveToday({ mood: i }); }
    }
    if (h.card) {
      h.card = false;
      const onPage = this.todayP.hit(this.card.mesh.getWorldPosition(this.v), 0.08) !== null;
      this.card.mesh.position.copy(CARDP);
      if (onPage) { sfx.drop(); this.placedPhoto = true; this.drawRecord(); }
    }
  }

  // ---------- actions ----------
  private tap(id: string) {
    sfx.tap();
    if (id === 'prev' || id === 'next') {
      if (this.mode === 'memory') return this.stepMemory(id === 'next' ? 1 : -1);
      return this.turnMonth(id === 'next' ? 1 : -1);
    }
    if (/^\d{4}-/.test(id)) { // a calendar cell
      if (id === this.today && !this.recorded(id)) return this.startRecord();
      if (this.days.get(id)?.photo && this.recorded(id)) return this.openDate(id);
      return sfx.no();
    }
    switch (id) {
      case 'openMemory': return this.openDate(this.memory!.date);
      case 'record': return this.startRecord();
      case 'inside': this.target = INSIDE; return;
      case 'back': return this.closeDate();
      case 'moodNext': if (this.todayE?.mood !== undefined) { this.rec = 1; this.typed = [...(this.todayE?.memo ?? '')]; this.setMode('record'); } return;
      case 'memoNext': if (this.typed.join('').trim()) { this.rec = 2; void this.saveToday({ memo: this.typed.join('').trim().slice(0, MEMO_MAX) }).then(() => this.setMode('record')); } return;
      case 'clear': this.typed = []; return this.drawMemo();
      case 'mic': return this.listen();
      case 'other': { const cur = this.todayE?.sample ?? -1; this.placedPhoto = false; void this.saveToday({ sample: (cur + 1) % SAMPLES.length }); return; }
      case 'finish': return void this.finish();
      case 'bk': this.typed.pop(); return this.drawMemo();
      case 'sp': this.typed.push(' '); return this.drawMemo();
    }
    if (id.startsWith('sg')) { this.typed = [...SUGGEST[+id.slice(2)]]; return this.drawMemo(); }
    if (id.length === 1 && this.typed.length < MEMO_MAX) { this.typed.push(this.typed.length ? id : id.toUpperCase()); this.drawMemo(); } // capital first letter
  }

  private turnMonth(dir: number) {
    this.month += dir;
    sfx.page();
    if (this.first && this.step === 1) this.next(2);
    this.drawCal();
  }

  private startRecord() {
    if (this.first && this.step < 2) return sfx.no();
    this.rec = this.todayE?.mood === undefined ? 0 : this.todayE?.memo ? 2 : 1;
    this.typed = [...(this.todayE?.memo ?? '')];
    this.placedPhoto = false;
    if (!this.todayE?.photo && this.todayE?.sample === undefined) void this.saveToday({ sample: Math.floor(Math.random() * SAMPLES.length) }); // a photo to place
    this.setMode('record');
  }

  private async finish() {
    const e = this.todayE;
    if (!(e && e.mood !== undefined && e.memo && this.placedPhoto)) return sfx.no();
    this.own.add(this.today);
    localStorage.setItem('vrdiary.visited', '1');
    this.first = false;
    this.mode = 'desk';
    await this.saveToday({ done: true });
    sfx.done();
    this.setMode('desk');
  }

  private async saveToday(p: Partial<Entry>) {
    const e = await patchEntry(this.today, p);
    const d: Day = { e };
    await this.loadImages(d);
    this.days.set(this.today, d);
    this.drawAll();
  }

  private listen() { // voice memo where the browser has speech recognition
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR || this.listening) return;
    const r = new SR();
    r.lang = 'en-US';
    r.onresult = (ev: any) => { this.typed = [...String(ev.results[0][0].transcript).slice(0, MEMO_MAX)]; this.drawMemo(); };
    r.onend = () => { this.listening = false; this.drawMemo(); };
    this.listening = true;
    r.start();
    this.drawMemo();
  }

  openDate(date: string) {
    const d = this.days.get(date);
    if (!d?.photo || !d.depth) return;
    this.disposePhoto();
    this.photo = makePhoto3D(d.photo, d.depth);
    this.frame.add(this.photo);
    this.openDay = date;
    this.scale = this.target = 1;
    sfx.open();
    padOn(d.e.mood ?? 2);
    this.setMode('memory');
  }

  private stepMemory(dir: number) { // ← → through the days that have a memory
    const list = [...this.days.keys()].filter((k) => this.recorded(k) && this.days.get(k)!.photo).sort();
    const i = list.indexOf(this.openDay!) + dir;
    if (i >= 0 && i < list.length) this.openDate(list[i]); else sfx.no();
  }

  closeDate() {
    if (!this.openDay) return;
    this.openDay = null;
    sfx.close();
    padOff();
    if (this.first && this.step === 0) { this.step = 1; this.stepAt = this.t; }
    this.setMode('desk');
  }

  private disposePhoto() {
    if (!this.photo) return;
    this.photo.removeFromParent();
    this.photo.geometry.dispose();
    const m = this.photo.material as MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
    this.photo = null;
  }

  private next(step: number) { this.step = step; this.stepAt = this.t; this.drawAll(); }

  /** Show the panels of one screen of the design. */
  private setMode(m: Mode) {
    this.mode = m;
    const r = m === 'record';
    this.diary.mesh.visible = this.cal.mesh.visible = m === 'desk';
    this.moodP.mesh.visible = r && this.rec === 0;
    this.orbs.forEach((o) => (o.visible = r && this.rec === 0));
    this.memoP.mesh.visible = this.keyb.mesh.visible = r && this.rec === 1;
    this.card.mesh.visible = this.todayP.mesh.visible = r && this.rec === 2;
    this.mem.mesh.visible = this.arrowL.mesh.visible = this.arrowR.mesh.visible = m === 'memory';
    if (m === 'memory') this.frame.visible = true;
    this.drawAll();
  }

  // ---------- animation ----------
  private animate(dt: number) {
    const open = this.mode === 'memory';
    this.openT += ((open ? 1 : 0) - this.openT) * Math.min(1, dt * 6);
    if (!open && this.openT < 0.02 && this.frame.visible) { this.frame.visible = false; this.disposePhoto(); }
    if (!this.grab) this.scale += (this.target - this.scale) * Math.min(1, dt * 3);
    const inside = open && this.scale > 1.3;
    this.mem.mesh.visible = this.arrowL.mesh.visible = this.arrowR.mesh.visible = open && !inside;
    this.chip.mesh.visible = inside;
    this.frame.scale.setScalar(FRAME_W * this.scale * (0.3 + 0.7 * this.openT));
    // bigger = higher and further back, so a life-size photo stands behind the desk instead of in it
    this.frame.position.set(FRAME.x, FRAME.y - 0.12 * (1 - this.openT) + (this.scale - 1) * 0.04, FRAME.z - (this.scale - 1) * 0.2);
    (this.dim.material as MeshBasicMaterial).opacity = 0.55 * this.openT;
    this.orbs.forEach((o, i) => { if (!this.hands.some((h) => h.orb === i)) o.position.y = ORBS_Y + Math.sin(this.t * 2 + i) * 0.004; });
    if (this.first && this.step === 1 && this.t - this.stepAt > 20) this.next(2); // nobody gets stuck on the swipe
    if (this.guideInside !== inside) { this.guideInside = inside; this.drawGuide(); }
  }

  // ---------- drawing ----------
  private drawAll() {
    this.drawDiary(); this.drawCal(); this.drawGuide();
    if (this.mode === 'record') this.drawRecord();
    if (this.mode === 'memory') this.drawMem();
  }
  private drawRecord() { if (this.rec === 0) this.drawMood(); else if (this.rec === 1) this.drawMemo(); else this.drawToday(); }

  /** Pills under the current screen: [bold, light] pairs. */
  private drawGuide() {
    const items: [string, string?][] = [];
    let y = 0.04, z = -0.05;
    if (this.mode === 'desk') {
      if (this.recorded(this.today)) items.push(['✓  Come back tomorrow']);
      else if (this.first && this.step === 0) items.push(['Pinch a date to open it']);
      else if (this.first && this.step === 1) items.push(['Swipe up or down to change months', 'Pinch a date to open a memory']);
      else items.push(["Pinch today's square to start", 'Takes 30 seconds']);
    } else if (this.mode === 'record') {
      y = 0.085;
      if (this.rec === 0) items.push(['Pinch an orb and drop it on the card']);
      if (this.rec === 2) items.push(['Done in 30 seconds', 'Today fills with your photo and mood']);
    } else if (this.guideInside) {
      const e = this.days.get(this.openDay ?? '')?.e;
      y = 0.06; z = 0.02;
      items.push([`${mmdd(this.openDay ?? '')} · ${e?.memo ?? ''}`], ['Push with an open palm to close']);
    } else { y = 0.035; z = 0; items.push(['Pinch the frame with both hands and spread', 'Move your head to look around']); }
    this.guide.mesh.position.set(this.mode === 'desk' ? CAL.x : 0, y, z);
    this.guide.mesh.rotation.x = -0.35;
    const p = this.guide, g = p.begin(), H = p.H, gap = 24;
    const width = ([b, l]: [string, string?]) => { g.font = 'bold 34px sans-serif'; let w = g.measureText(b).width; if (l) { g.font = '30px sans-serif'; w += 22 + g.measureText(l).width; } return w + 80; };
    let x = (p.W - items.reduce((a, it) => a + width(it) + gap, -gap)) / 2;
    for (const it of items) {
      const w = width(it);
      p.box(x, 2, w, H - 4, 'rgba(58,54,52,0.92)', (H - 4) / 2);
      p.text(it[0], x + 40, H / 2, 34, '#fff', 'left', 'bold');
      if (it[1]) { g.font = 'bold 34px sans-serif'; p.text(it[1], x + 40 + g.measureText(it[0]).width + 22, H / 2, 30, '#ffffffcc'); }
      x += w + gap;
    }
    p.mesh.visible = items.length > 0;
    p.done();
  }

  private drawDiary() {
    const p = this.diary, e = this.todayE, d = this.days.get(this.today);
    p.begin(); p.glass(64);
    const X = 40, W = p.W - 80;
    if (e?.done && d?.photo) { // today, filled
      p.text('Diary', X, 70, 44, '#fff', 'left', 'bold');
      p.text(`${weekday(this.today)}, ${mmdd(this.today)}`, X, 128, 30, '#fff', 'left', 'bold');
      p.image(d.photo, X, 154, W, 140, 30);
      this.moodMemo(p, X, 308, W, e.mood, e.memo ?? '');
      const s = this.streak();
      if (s) p.text(`${s}-day streak`, X, p.H - 34, 28, '#fff', 'left', 'bold');
    } else if (this.memory && !this.first) { // last week's memory, ready to open
      const m = this.memory, md = this.days.get(m.date)!;
      p.text(m.label, X, 70, 44, '#fff', 'left', 'bold');
      if (md.photo) p.image(md.photo, X, 110, W, 170, 30);
      p.dot(X + 20, 322, 20, MOODS[md.e.mood ?? 2].color);
      p.wrap(`${mmdd(m.date)} · ${md.e.memo ?? ''}`, X + 56, 322, W - 56, 28, '#fff', '', 36, 1);
      p.button('openMemory', X, 362, W, 70, 'Open', 'rgba(255,255,255,0.18)', '#fff', 30);
      const s = this.streak();
      if (s) p.text(`${s}-day streak`, X, p.H - 32, 28, '#fff', 'left', 'bold');
    } else { // nothing yet today
      p.text('Diary', X, 70, 44, '#fff', 'left', 'bold');
      p.text(`${weekday(this.today)}, ${mmdd(this.today)}`, X, 128, 30, '#fff', 'left', 'bold');
      p.box(X, 160, W, 140, 'rgba(40,42,50,0.55)', 30);
      p.wrap(this.first && this.step < 2 ? 'Today is still empty. Open a past memory first.' : "Today is still empty. Pinch today's square to write.", X + 26, 210, W - 52, 28, '#fff', '', 40, 2);
      p.button('record', X, 160, W, 140);
      p.text(`${SAMPLES.length} sample entries included.`, X, 340, 28, '#fff');
    }
    p.done();
  }

  private moodMemo(p: Panel, x: number, y: number, w: number, mood: number | undefined, memo: string) {
    p.box(x, y, w, 96, 'rgba(40,42,50,0.55)', 26);
    if (mood !== undefined) p.dot(x + 34, y + 48, 16, MOODS[mood].color);
    p.wrap(memo, x + 64, y + 32, w - 84, 26, '#fff', '', 32, 2);
  }

  private drawCal() {
    const p = this.cal, g = p.begin();
    p.glass(72);
    const now = new Date(), m = new Date(now.getFullYear(), now.getMonth() + this.month, 1);
    const n = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate(), start = m.getDay();
    let count = 0;
    for (let day = 1; day <= n; day++) if (this.recorded(dayKey(new Date(m.getFullYear(), m.getMonth(), day)))) count++;
    p.text(`${MONTHS[m.getMonth()]} ${m.getFullYear()}`, 50, 76, 52, '#fff', 'left', 'bold');
    p.text(`${count} days logged`, 52, 124, 26, '#ffffffcc');
    for (const [id, x, s] of [['prev', p.W - 176, '⌃'], ['next', p.W - 100, '⌄']] as const) {
      p.button(id, x, 50, 64, 64);
      p.dot(x + 32, 82, 32, 'rgba(255,255,255,0.16)');
      p.text(s, x + 32, id === 'prev' ? 92 : 74, 40, '#fff', 'center', 'bold');
    }
    const x0 = 46, cw = (p.W - 92) / 7, y0 = 196, rh = (p.H - y0 - 36) / 6;
    WEEK.forEach((d, i) => p.text(d.slice(0, 3), x0 + cw * (i + 0.5), 172, 26, '#ffffffcc', 'center', 'bold'));
    for (let day = 1; day <= n; day++) {
      const k = start + day - 1, x = x0 + (k % 7) * cw + 5, y = y0 + Math.floor(k / 7) * rh + 5, w = cw - 10, h = rh - 10;
      const key = dayKey(new Date(m.getFullYear(), m.getMonth(), day)), d = this.days.get(key), done = this.recorded(key);
      p.button(key, x, y, w, h);
      if (done && d?.photo) {
        p.image(d.photo, x, y, w, h, 18);
        p.box(x, y, w, h, 'rgba(0,0,0,0.18)', 18);
        p.dot(x + 22, y + h - 20, 11, MOODS[d.e.mood ?? 2].color);
      } else p.box(x, y, w, h, 'rgba(255,255,255,0.16)', 18);
      p.text(String(day), x + 14, y + 26, 28, '#fff', 'left', 'bold');
      if (key === this.today || key === this.memory?.date) {
        g.lineWidth = 6;
        g.strokeStyle = key === this.today && this.blink ? '#ff9f43' : '#fff';
        g.beginPath(); g.roundRect(x, y, w, h, 18); g.stroke();
      }
    }
    p.done();
  }

  private drawMood() {
    const p = this.moodP, e = this.todayE;
    p.begin(); p.glass(72);
    p.text("Today's mood", 50, 76, 52, '#fff', 'left', 'bold');
    p.text(`${weekday(this.today)}, ${mmdd(this.today)}`, p.W - 50, 80, 30, '#fff', 'right');
    p.box(50, 130, p.W - 100, 160, 'rgba(40,42,50,0.6)', 36);
    if (e?.mood !== undefined) {
      p.dot(130, 210, 46, MOODS[e.mood].color);
      p.text(`Placed: ${MOODS[e.mood].name}`, 200, 210, 34, '#fff', 'left', 'bold');
    } else {
      const g = p.g;
      g.setLineDash([12, 10]); g.strokeStyle = '#ffffff99'; g.lineWidth = 4;
      g.beginPath(); g.arc(130, 210, 46, 0, 7); g.stroke(); g.setLineDash([]);
      p.text('Drop an orb here', 200, 210, 34, DIM, 'left', 'bold');
    }
    p.text('Colors today on the calendar.', 50, 350, 30, '#fff');
    p.button('moodNext', p.W - 170, 318, 120, 64, 'Next', e?.mood !== undefined ? '#fff' : 'rgba(255,255,255,0.25)', '#111', 30);
    p.done();
  }

  private drawMemo() {
    const p = this.memoP, text = this.typed.join('');
    p.begin(); p.glass(72);
    p.text('Today in one line', 50, 74, 52, '#fff', 'left', 'bold');
    p.text(`${text.length} / ${MEMO_MAX}`, p.W - 50, 80, 32, '#fff', 'right', 'bold');
    const g = p.g;
    g.font = '32px sans-serif';
    const fw = Math.min(p.W - 220, Math.max(320, g.measureText(text || 'Write about today').width + 120));
    p.box(50, 128, fw, 70, 'rgba(40,42,50,0.6)', 22);
    p.text(text || 'Write about today', 74, 163, 32, text ? '#fff' : DIM);
    if (text) { p.button('clear', 50 + fw - 58, 143, 40, 40); p.dot(50 + fw - 38, 163, 20, 'rgba(255,255,255,0.25)'); p.text('×', 50 + fw - 38, 162, 28, '#fff', 'center', 'bold'); }
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (SR) { p.button('mic', p.W - 120, 128, 70, 70); p.dot(p.W - 85, 163, 35, this.listening ? '#ff375f' : 'rgba(255,255,255,0.22)'); p.text('🎤', p.W - 85, 165, 30, '#fff', 'center'); }
    p.text('Quick phrases', 50, 240, 30, '#fff', 'left', 'bold');
    let x = 50;
    SUGGEST.forEach((s, i) => { g.font = 'bold 26px sans-serif'; const w = g.measureText(s).width + 40; p.button(`sg${i}`, x, 268, w, 64, s, 'rgba(255,255,255,0.18)', '#fff', 26); x += w + 10; });
    p.text(`Up to ${MEMO_MAX} characters.${SR ? ' Mic where supported.' : ''}`, 50, 372, 30, '#fff');
    p.button('memoNext', p.W - 170, 340, 120, 64, 'Next', text.trim() ? '#fff' : 'rgba(255,255,255,0.25)', '#111', 30);
    p.done();
    // the big-key keyboard under it
    const k = this.keyb;
    k.begin('rgba(36,38,44,0.96)', 64);
    const kw = (k.W - 60) / 10.5;
    KEYS.forEach((row, r) => [...row].forEach((ch, i) => k.button(ch, 30 + (r * 0.25 + i) * kw + 4, 30 + r * 66, kw - 8, 58, ch, 'rgba(255,255,255,0.14)', '#fff', 30)));
    k.button('sp', 30 + kw * 2, 30 + 3 * 66, kw * 4.6, 58, 'space', 'rgba(255,255,255,0.14)', '#fff', 26);
    k.button('bk', 30 + kw * 6.8, 30 + 3 * 66, kw * 1.6, 58, '⌫', 'rgba(255,255,255,0.14)', '#fff', 30);
    k.done();
  }

  private drawToday() {
    const e = this.todayE, d = this.days.get(this.today);
    // the photo picked before VR (or a sample), to carry onto the page
    const c = this.card;
    c.begin();
    if (d?.photo) { c.g.shadowColor = 'rgba(0,0,0,0.45)'; c.g.shadowBlur = 30; c.box(16, 16, c.W - 32, 256, '#000', 26); c.g.shadowBlur = 0; c.image(d.photo, 16, 16, c.W - 32, 256, 26); }
    if (e?.photo) c.text('Picked before VR', c.W / 2, 316, 26, '#ffffffaa', 'center', 'bold');
    else c.button('other', c.W / 2 - 120, 290, 240, 58, 'Another ▶', 'rgba(255,255,255,0.2)', '#fff', 26);
    c.mesh.visible = this.mode === 'record' && this.rec === 2 && !this.placedPhoto;
    c.done();
    const p = this.todayP;
    p.begin(); p.glass(72);
    p.text(mmdd(this.today), 50, 74, 54, '#fff', 'left', 'bold');
    p.text(weekday(this.today), p.W - 50, 80, 30, '#fff', 'right');
    if (this.placedPhoto && d?.photo) p.image(d.photo, 50, 124, p.W - 100, 150, 30);
    else {
      const g = p.g;
      g.setLineDash([14, 10]); g.strokeStyle = '#ffffffaa'; g.lineWidth = 4;
      g.beginPath(); g.roundRect(50, 124, p.W - 100, 150, 30); g.stroke(); g.setLineDash([]);
      p.text('Pinch the photo and drop it here', p.W / 2, 199, 30, '#fff', 'center', 'bold');
    }
    p.box(50, 290, p.W - 100, 58, 'rgba(40,42,50,0.6)', 22);
    if (e?.mood !== undefined) p.dot(82, 319, 14, MOODS[e.mood].color);
    p.wrap(e?.memo ?? '', 110, 319, p.W - 180, 26, '#fff', '', 32, 1);
    p.text('Mood · line · photo', 50, 384, 26, '#fff');
    p.button('finish', p.W - 210, 356, 160, 58, 'Save', this.placedPhoto ? '#fff' : 'rgba(255,255,255,0.25)', '#111', 28);
    p.done();
  }

  private drawMem() {
    const k = this.openDay, d = k ? this.days.get(k) : null;
    if (!k || !d) return;
    const p = this.mem, mood = MOODS[d.e.mood ?? 2];
    p.begin(); p.glass(72);
    p.dot(70, 74, 20, mood.color);
    p.text(`${weekday(k)}, ${mmdd(k)} · ${mood.name}`, 110, 74, 40, '#fff', 'left', 'bold');
    p.wrap(d.e.memo ?? '', 52, 138, p.W - 104, 30, '#fff', '', 36, 1);
    const g = p.g;
    g.font = 'bold 30px sans-serif';
    const w1 = g.measureText('Step inside').width + 56, w2 = g.measureText('Back to calendar').width + 56;
    p.button('inside', 50, 172, w1, 60, 'Step inside', '#fff', '#111', 30);
    p.button('back', 50 + w1 + 16, 172, w2, 60, 'Back to calendar', 'rgba(255,255,255,0.18)', '#fff', 30);
    p.done();
    const c = this.chip;
    c.begin();
    c.g.font = 'bold 40px sans-serif';
    const label = `♪  Soft sound · ${mood.name}`, cw = c.g.measureText(label).width + 60;
    c.box(c.W - cw, 0, cw, c.H, 'rgba(255,255,255,0.22)', c.H / 2);
    c.text(label, c.W - cw / 2, c.H / 2, 40, '#fff', 'center', 'bold');
    c.done();
  }

  private streak() { // consecutive days you wrote yourself (samples don't count), from today or yesterday backwards
    let n = 0, d = new Date();
    if (!this.own.has(dayKey(d))) d = addDays(d, -1);
    while (this.own.has(dayKey(d))) { n++; d = addDays(d, -1); }
    return n;
  }
}
