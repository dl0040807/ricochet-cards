// Parts-built squirrel (no rig): every body part is its own mesh so code can animate it.
// Look: deliberately toy-like, not realistic: one chubby loaf, huge glossy eyes, tiny raised paws, big curled tail.
import {
  BoxGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
} from '@iwsdk/core';

const lam = (color: number) => new MeshLambertMaterial({ color });
const FUR = lam(0xd9843f);
const FUR_DARK = lam(0xb5622a);
const CREAM = lam(0xfbe8cc);
const DARK = new MeshBasicMaterial({ color: 0x241510 });
const WHITE = new MeshBasicMaterial({ color: 0xffffff });
const PINK = lam(0xf29aa6);
const WOOD = lam(0x9a6a3c);
const WOOD_DARK = lam(0x6b4525);
const GOLD = lam(0xf2c230);
const LEAF = lam(0x5fae57);
const STRAW = lam(0xe7c877);

const sphere = (r: number, mat: any, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new Mesh(new SphereGeometry(r, 20, 14), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  return m;
};
const at = <T extends Object3D>(o: T, x: number, y: number, z: number) => (o.position.set(x, y, z), o);
const group = (x = 0, y = 0, z = 0, ...kids: Object3D[]) => {
  const g = new Group();
  g.position.set(x, y, z);
  kids.forEach((k) => g.add(k));
  return g;
};

export type Squirrel = ReturnType<typeof makeSquirrel>;

/** Squirrel ~14 cm tall, feet at y=0, facing +Z. */
export function makeSquirrel() {
  const root = new Group();
  // one chubby loaf: cream front, brown back and top (like the toy-hamster reference), no neck
  const body = sphere(0.05, CREAM, 0, 0.058, 0.004, 1, 1.15, 0.92);
  const back = sphere(0.05, FUR, 0, 0.062, -0.01, 1.03, 1.13, 0.9);
  const belly = sphere(0.03, CREAM, 0, 0.05, 0.024, 1, 1, 0.8);
  const footL = sphere(0.012, PINK, -0.024, 0.007, 0.03, 1, 0.6, 1.3);
  const footR = sphere(0.012, PINK, 0.024, 0.007, 0.03, 1, 0.6, 1.3);

  // tiny paws held up in front; pivot at the shoulder
  const paw = () => group(0, 0, 0, sphere(0.011, CREAM, 0, -0.016, 0.004, 1, 1.6, 1), sphere(0.006, PINK, 0, -0.032, 0.006));
  const armL = at(paw(), -0.036, 0.086, 0.03);
  const armR = at(paw(), 0.036, 0.086, 0.03);

  // head: brown cap over a cream face, huge glossy eyes set wide
  const cheekL = sphere(0.02, CREAM, -0.03, -0.018, 0.022);
  const cheekR = sphere(0.02, CREAM, 0.03, -0.018, 0.022);
  const EX = 0.027;
  const eyeOpen = group(0, 0, 0,
    sphere(0.0175, DARK, -EX, 0.006, 0.034), sphere(0.0175, DARK, EX, 0.006, 0.034),
    sphere(0.005, WHITE, -EX + 0.005, 0.013, 0.048), sphere(0.005, WHITE, EX + 0.005, 0.013, 0.048),
    sphere(0.0022, WHITE, -EX - 0.005, 0.001, 0.05), sphere(0.0022, WHITE, EX - 0.005, 0.001, 0.05));
  const arc = (x: number) => at(new Mesh(new TorusGeometry(0.012, 0.0024, 6, 14, Math.PI), DARK), x, 0.004, 0.05);
  const eyeHappy = group(0, 0, 0, arc(-EX), arc(EX)); // ^ ^
  const cross = (x: number) => {
    const g = group(x, 0.006, 0.051);
    for (const r of [0.7, -0.7]) {
      const b = new Mesh(new BoxGeometry(0.026, 0.004, 0.002), DARK);
      b.rotation.z = r;
      g.add(b);
    }
    return g;
  };
  const eyeOuch = group(0, 0, 0, cross(-EX), cross(EX)); // x x
  const ear = (x: number) => {
    const e = sphere(0.013, FUR_DARK, x, 0.042, -0.004, 1, 1.25, 0.6);
    e.rotation.z = -x * 8;
    e.add(sphere(0.008, PINK, 0, -0.001, 0.006, 1, 1.1, 0.5));
    return e;
  };
  const hatSlot = group(0, 0.042, 0);
  const faceSlot = group(0, 0.006, 0.05);
  const head = group(0, 0.122, 0.004,
    sphere(0.05, FUR, 0, 0, 0, 1.06, 0.92, 0.98), sphere(0.044, CREAM, 0, -0.016, 0.012, 1.08, 0.78, 1),
    cheekL, cheekR,
    sphere(0.005, PINK, 0, -0.012, 0.054, 1.2, 0.8, 0.8), eyeOpen, eyeHappy, eyeOuch, ear(-0.034), ear(0.034), hatSlot, faceSlot);
  const mouth = group(0, -0.026, 0.054); // where food goes / the key is carried
  head.add(mouth);

  // tail: big S-curl behind the body, pivots at the base
  const tail = group(0, 0.03, -0.04,
    sphere(0.03, FUR, 0, 0.025, -0.022), sphere(0.037, FUR, 0, 0.08, -0.036), sphere(0.034, FUR, 0, 0.135, -0.022),
    sphere(0.026, FUR_DARK, 0, 0.165, 0.004), sphere(0.017, CREAM, 0, 0.158, 0.022));
  const neckSlot = group(0, 0.096, 0.004);
  const backSlot = group(0, 0.1, -0.04);

  root.add(back, body, belly, footL, footR, armL, armR, head, tail, neckSlot, backSlot);
  return { root, body, belly, head, cheekL, cheekR, armL, armR, tail, eyeOpen, eyeHappy, eyeOuch, mouth, hatSlot, faceSlot, neckSlot, backSlot };
}

// ---- skins: small props on the head / neck / face ----
export type SkinSlot = 'hat' | 'neck' | 'face' | 'back' | 'fur';
export type Rarity = 'common' | 'rare' | 'legend';
export const SKINS: { id: string; name: string; slot: SkinSlot; rarity?: Rarity; make: () => Object3D }[] = [
  {
    id: 'strawHat', name: '밀짚모자', slot: 'hat', make: () => {
      const brim = new Mesh(new CylinderGeometry(0.066, 0.07, 0.004, 24), STRAW);
      const top = at(new Mesh(new CylinderGeometry(0.03, 0.036, 0.026, 20), STRAW), 0, 0.014, 0);
      const band = at(new Mesh(new CylinderGeometry(0.0365, 0.037, 0.008, 20), WOOD_DARK), 0, 0.006, 0);
      const g = group(0, 0, 0, brim, top, band);
      g.rotation.x = -0.12;
      return g;
    },
  },
  {
    id: 'acornHat', name: '도토리 모자', slot: 'hat', make: () => {
      const cap = new Mesh(new SphereGeometry(0.04, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), WOOD_DARK);
      cap.scale.y = 0.75;
      return group(0, -0.012, 0, cap, at(new Mesh(new CylinderGeometry(0.003, 0.004, 0.014, 6), WOOD), 0, 0.034, 0));
    },
  },
  {
    id: 'scarf', name: '빨간 목도리', slot: 'neck', make: () => {
      const ring = new Mesh(new TorusGeometry(0.036, 0.011, 8, 20), lam(0xd83a3a));
      ring.rotation.x = Math.PI / 2;
      return group(0, 0, 0, ring, at(new Mesh(new BoxGeometry(0.016, 0.04, 0.006), lam(0xd83a3a)), 0.02, -0.022, 0.036));
    },
  },
  {
    id: 'glasses', name: '동그란 안경', slot: 'face', make: () => {
      const ring = (x: number) => at(new Mesh(new TorusGeometry(0.0195, 0.0018, 6, 24), DARK), x, 0, 0);
      return group(0, 0, 0.003, ring(-0.027), ring(0.027), new Mesh(new BoxGeometry(0.016, 0.002, 0.002), DARK));
    },
  },
  {
    id: 'bowtie', name: '나비넥타이', slot: 'neck', make: () => {
      const wing = (r: number) => {
        const c = new Mesh(new ConeGeometry(0.012, 0.022, 8), lam(0x3b6fd8));
        c.rotation.z = r;
        c.position.x = r > 0 ? 0.011 : -0.011;
        return c;
      };
      return group(0, -0.006, 0.04, wing(Math.PI / 2), wing(-Math.PI / 2), sphere(0.005, lam(0x2a4fa0)));
    },
  },
  {
    id: 'flowerCrown', name: '꽃 화관', slot: 'hat', make: () => {
      const ring = new Mesh(new TorusGeometry(0.036, 0.004, 6, 20), LEAF);
      ring.rotation.x = Math.PI / 2;
      const g = group(0, -0.006, 0, ring);
      const cols = [0xff7aa0, 0xffd34d, 0xffffff, 0xff9a5c, 0xc08cff, 0xff7aa0];
      cols.forEach((c, i) => {
        const a = (i / 6) * Math.PI * 2;
        g.add(sphere(0.008, lam(c), Math.cos(a) * 0.036, 0.003, Math.sin(a) * 0.036));
      });
      return g;
    },
  },
  {
    id: 'wizardHat', name: '마법사 모자', slot: 'hat', rarity: 'rare', make: () => {
      const m = lam(0x4b3a9e);
      const cone = at(new Mesh(new ConeGeometry(0.036, 0.075, 18), m), 0, 0.035, 0);
      cone.rotation.z = 0.15;
      const g = group(0, -0.006, 0, new Mesh(new CylinderGeometry(0.058, 0.058, 0.004, 24), m), cone);
      for (let i = 0; i < 3; i++) g.add(sphere(0.0045, GOLD, Math.cos(i * 2.1) * 0.022, 0.02 + i * 0.012, Math.sin(i * 2.1) * 0.022 + 0.01));
      return g;
    },
  },
  {
    id: 'cape', name: '망토', slot: 'back', rarity: 'rare', make: () => {
      const c = new Mesh(new CylinderGeometry(0.03, 0.06, 0.085, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8), new MeshLambertMaterial({ color: 0xc0283c, side: DoubleSide }));
      c.position.set(0, -0.035, 0.035);
      return group(0, 0, 0, c, at(new Mesh(new TorusGeometry(0.03, 0.004, 6, 16), GOLD), 0, 0.006, 0.04).rotateX(Math.PI / 2));
    },
  },
  {
    id: 'sunglasses', name: '선글라스', slot: 'face', rarity: 'rare', make: () => {
      const lens = (x: number) => at(new Mesh(new BoxGeometry(0.036, 0.022, 0.004), DARK), x, 0, 0);
      return group(0, 0.002, 0.004, lens(-0.027), lens(0.027), new Mesh(new BoxGeometry(0.02, 0.004, 0.004), DARK));
    },
  },
  {
    id: 'headphones', name: '헤드폰', slot: 'hat', rarity: 'rare', make: () => {
      const band = new Mesh(new TorusGeometry(0.052, 0.005, 6, 24, Math.PI), lam(0x2d2d36));
      band.position.y = -0.038;
      const cup = (x: number) => { const c = at(new Mesh(new CylinderGeometry(0.016, 0.016, 0.012, 16), lam(0xff5fa2)), x, -0.04, 0); c.rotation.z = Math.PI / 2; return c; };
      return group(0, 0, 0, band, cup(-0.052), cup(0.052));
    },
  },
  {
    id: 'crown', name: '왕관', slot: 'hat', rarity: 'legend', make: () => {
      const g = group(0, -0.004, 0, new Mesh(new CylinderGeometry(0.03, 0.03, 0.016, 20, 1, true), new MeshLambertMaterial({ color: 0xf2c230, side: DoubleSide })));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.add(at(new Mesh(new ConeGeometry(0.007, 0.018, 6), GOLD), Math.cos(a) * 0.028, 0.016, Math.sin(a) * 0.028));
        g.add(sphere(0.004, lam(i % 2 ? 0x3fb6ff : 0xff4d6d), Math.cos(a + 0.6) * 0.031, 0, Math.sin(a + 0.6) * 0.031));
      }
      return g;
    },
  },
  {
    // worn = the whole coat turns gold; this fluff ball is its wardrobe icon
    id: 'goldFur', name: '황금 털', slot: 'fur', rarity: 'legend', make: () => group(0, 0.012, 0, sphere(0.016, GOLD), sphere(0.01, GOLD, 0.012, 0.008, 0), sphere(0.01, GOLD, -0.011, 0.006, 0.004)),
  },
];

// ---- desk props (origin at the desk surface) ----
export function makeAcorn() {
  const cap = new Mesh(new SphereGeometry(0.0125, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), WOOD_DARK);
  cap.position.y = 0.004;
  return group(0, 0, 0, sphere(0.011, lam(0xc98a4a), 0, 0, 0, 1, 1.25, 1), cap);
}

export function makeBasket() {
  const wall = new Mesh(new CylinderGeometry(0.05, 0.04, 0.045, 20, 1, true), new MeshLambertMaterial({ color: 0xb98a55, side: DoubleSide }));
  wall.position.y = 0.0225;
  const g = group(0, 0, 0, wall, at(new Mesh(new CylinderGeometry(0.04, 0.04, 0.004, 20), WOOD), 0, 0.002, 0));
  for (let i = 0; i < 6; i++) g.add(at(makeAcorn(), Math.cos(i * 1.05) * 0.022, 0.03 + (i % 2) * 0.008, Math.sin(i * 1.05) * 0.022));
  return g;
}

export function makeTrash() {
  const wall = new Mesh(new CylinderGeometry(0.042, 0.034, 0.07, 20, 1, true), new MeshLambertMaterial({ color: 0x8fa3ad, side: DoubleSide }));
  wall.position.y = 0.035;
  return group(0, 0, 0, wall, at(new Mesh(new CylinderGeometry(0.034, 0.034, 0.004, 20), lam(0x6f8089)), 0, 0.002, 0));
}

export function makeTree() {
  const trunk = at(new Mesh(new CylinderGeometry(0.06, 0.075, 0.2, 16), WOOD), 0, 0.1, 0);
  const hole = at(new Mesh(new CircleGeometry(0.038, 20), DARK), 0, 0.055, 0.0665);
  hole.rotation.x = -0.07;
  return group(0, 0, 0, trunk, hole, sphere(0.11, LEAF, 0, 0.27, 0, 1, 0.8, 1), sphere(0.07, lam(0x74c268), 0.07, 0.3, 0.03), sphere(0.06, lam(0x4f9a4a), -0.08, 0.25, 0.02));
}

export function makeChest() {
  const base = at(new Mesh(new BoxGeometry(0.1, 0.045, 0.065), WOOD), 0, 0.0225, 0);
  const lid = group(0, 0.045, -0.0325, at(new Mesh(new BoxGeometry(0.1, 0.022, 0.065), WOOD_DARK), 0, 0.011, 0.0325)); // hinge at the back edge
  const lock = at(new Mesh(new BoxGeometry(0.018, 0.022, 0.006), GOLD), 0, 0.04, 0.035);
  return { root: group(0, 0, 0, base, lid, lock), lid };
}

export function makeKey() {
  const ring = new Mesh(new TorusGeometry(0.009, 0.0028, 8, 16), GOLD);
  return group(0, 0, 0, ring, at(new Mesh(new BoxGeometry(0.004, 0.026, 0.004), GOLD), 0, -0.022, 0),
    at(new Mesh(new BoxGeometry(0.01, 0.004, 0.004), GOLD), 0.005, -0.03, 0));
}

export function makePoop() {
  const m = lam(0x7a4b26);
  return group(0, 0, 0, sphere(0.014, m, 0, 0.008, 0, 1, 0.7, 1), sphere(0.01, m, 0, 0.018, 0, 1, 0.75, 1), sphere(0.006, m, 0, 0.026, 0));
}

/** Golden coat on/off (legendary skin). */
export function setGoldFur(on: boolean) {
  FUR.color.setHex(on ? 0xf2c230 : 0xd9843f);
  FUR_DARK.color.setHex(on ? 0xd99a10 : 0xb5622a);
}

/** Dark see-through copy of a skin for the wardrobe slots you don't own yet. */
const SHADOW = new MeshBasicMaterial({ color: 0x1a1a22, transparent: true, opacity: 0.55 });
export function shadowOf(make: () => Object3D) {
  const o = make();
  o.traverse((c) => { if ((c as Mesh).isMesh) (c as Mesh).material = SHADOW; });
  return o;
}

export const makeHeart = () => sphere(0.008, new MeshBasicMaterial({ color: 0xff6f91 }), 0, 0, 0, 1, 0.9, 0.5);
export const makeSlot = () => {
  const d = new Mesh(new CircleGeometry(0.026, 20), new MeshBasicMaterial({ color: 0x2b2b33, transparent: true, opacity: 0.55 }));
  d.rotation.x = -Math.PI / 2;
  d.position.y = 0.001;
  return d;
};
export const makePedestal = () => at(new Mesh(new CylinderGeometry(0.42, 0.42, 0.02, 40), lam(0xe9dcc6)), 0, -0.011, -0.06);
