// Pet state + rules. Pure functions (no DOM) except load/save, so they can be checked from node.
export type Save = {
  full: number; clean: number; mood: number; poops: number;
  owned: string[]; wearing: string | null;
  last: number; // ms of the last save
  day: string; // day the daily values below belong to
  keyChance: number; keyToday: boolean; keyGot: boolean; hasKey: boolean;
  petToday: number; streak: number; first: boolean;
};

const KEY = 'daramji.save';
export const SKIN_IDS = ['strawHat', 'acornHat', 'scarf', 'glasses', 'bowtie', 'flowerCrown'];
export const HOUR = 3600e3;
export const PET_CAP = 30; // mood points from petting per day
const clamp = (v: number) => Math.max(0, Math.min(100, v));
export const dayOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export const fresh = (now: number): Save => ({
  full: 70, clean: 100, mood: 60, poops: 0, owned: [], wearing: null, last: now, day: dayOf(now),
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

/** Next skin from the chest: never a duplicate; the very first chest is always the acorn hat. */
export function drawSkin(owned: string[], rnd = Math.random): string | null {
  const left = SKIN_IDS.filter((id) => !owned.includes(id));
  if (!left.length) return null;
  if (left.includes('acornHat')) return 'acornHat';
  return left[Math.floor(rnd() * left.length)];
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
  const away = applyAway(s, now);
  newDay(s, now);
  return { s, away };
}
export function save(s: Save) {
  s.last = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} // private mode: play without saving
}
