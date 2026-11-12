// Pet state + rules. Pure functions (no DOM) except load/save, so they can be checked from node.
export type Save = {
  full: number; clean: number; mood: number; poops: number;
  owned: string[]; worn: string[];
  last: number; // ms of the last save
  day: string; // day the daily values below belong to
  keyChance: number; keyToday: boolean; keyGot: boolean; hasKey: boolean;
  petToday: number; streak: number; first: boolean;
};

const KEY = 'daramji.save';
// PRD skin table: common 60%, rare 30%, legendary 10% (wardrobe order = this order)
export const SKIN_RARITY: Record<string, 'common' | 'rare' | 'legend'> = {
  acornHat: 'common', scarf: 'common', strawHat: 'common', glasses: 'common', bowtie: 'common', flowerCrown: 'common',
  wizardHat: 'rare', cape: 'rare', sunglasses: 'rare', headphones: 'rare', crown: 'legend', goldFur: 'legend',
};
export const SKIN_IDS = Object.keys(SKIN_RARITY);
const TIER_W = { common: 0.6, rare: 0.3, legend: 0.1 };
export const HOUR = 3600e3;
export const PET_CAP = 30; // mood points from petting per day
const clamp = (v: number) => Math.max(0, Math.min(100, v));
export const dayOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export const fresh = (now: number): Save => ({
  full: 70, clean: 100, mood: 60, poops: 0, owned: [], worn: [], last: now, day: dayOf(now),
  keyChance: 0.5, keyToday: false, keyGot: false, hasKey: false, petToday: 0, streak: 1, first: true,
});

/** Time passed while away: hunger drops (100 -> 0 in ~6 h), poop piles up (max 3). Returns hours away. */
export function applyAway(s: Save, now: number) {
  const h = Math.max(0, now - s.last) / HOUR;
  s.full = clamp(s.full - (h * 100) / 6);
  s.poops = Math.min(3, s.poops + Math.floor(h / 2));
  s.clean = clamp(100 - s.poops * 25);
  if (h > 6) s.mood = clamp(s.mood - 15);
  s.last = now;
  return h;
}

/** New calendar day: roll today's key (50%, +25% per missed day), reset daily caps, update the streak. */
export function newDay(s: Save, now: number, rnd = Math.random) {
  const today = dayOf(now);
  if (s.day === today) return;
  s.streak = s.day === dayOf(now - 24 * HOUR) ? s.streak + 1 : 1;
  s.day = today;
  s.petToday = 0;
  s.keyGot = false;
  s.keyToday = !s.first && rnd() < s.keyChance;
  s.keyChance = s.keyToday ? 0.5 : Math.min(1, s.keyChance + 0.25);
}

/** Next skin from the chest: never a duplicate; the very first chest is always the acorn hat.
 *  Rolls the tier (60/30/10) among tiers that still have something left, then a skin inside it. */
export function drawSkin(owned: string[], rnd = Math.random): string | null {
  const left = SKIN_IDS.filter((id) => !owned.includes(id));
  if (!left.length) return null;
  if (left.includes('acornHat')) return 'acornHat';
  const tiers = (['common', 'rare', 'legend'] as const).filter((t) => left.some((id) => SKIN_RARITY[id] === t));
  let r = rnd() * tiers.reduce((a, t) => a + TIER_W[t], 0);
  const tier = tiers.find((t) => (r -= TIER_W[t]) < 0) ?? tiers[tiers.length - 1];
  const pool = left.filter((id) => SKIN_RARITY[id] === tier);
  return pool[Math.floor(rnd() * pool.length)];
}

export function feed(s: Save) { // returns false when already stuffed
  if (s.full >= 100) return false;
  s.full = clamp(s.full + 20);
  s.mood = clamp(s.mood + 5);
  return true;
}
export function pet(s: Save) {
  if (s.petToday < PET_CAP) { s.petToday += 5; s.mood = clamp(s.mood + 5); }
}
export const flick = (s: Save) => { s.mood = clamp(s.mood - 10); };
export function addPoop(s: Save) { if (s.poops < 3) s.poops++; s.clean = clamp(100 - s.poops * 25); }
export function cleanPoop(s: Save) { s.poops = Math.max(0, s.poops - 1); s.clean = clamp(100 - s.poops * 25); s.mood = clamp(s.mood + 5); }
export function tick(s: Save, dt: number) { // dt seconds, while playing
  s.full = clamp(s.full - (dt * 100) / (6 * 3600));
  if (s.full < 20 || s.poops > 0) s.mood = clamp(s.mood - dt / 60); // neglect: -1 per minute
}

export function load(now = Date.now()): { s: Save; away: number } {
  let s: Save;
  try { s = { ...fresh(now), ...JSON.parse(localStorage.getItem(KEY) ?? 'null') }; } catch { s = fresh(now); }
  const old = (s as any).wearing; // v1 saves kept one worn skin
  if (typeof old === 'string' && !s.worn.includes(old)) s.worn.push(old);
  delete (s as any).wearing;
  const away = applyAway(s, now);
  newDay(s, now);
  return { s, away };
}
export function save(s: Save) {
  s.last = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} // private mode: play without saving
}
