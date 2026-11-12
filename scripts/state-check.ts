// Self-check for the pet rules in src/state.ts. Run: npm run check
import assert from 'node:assert/strict';
import { HOUR, SKIN_IDS, SKIN_RARITY, addPoop, applyAway, cleanPoop, dayOf, drawSkin, feed, flick, fresh, newDay, pet } from '../src/state.ts';

const t0 = new Date(2026, 10, 12, 9).getTime();

// away time: 3 h = half the hunger gone, 1 poop per 2 h, never more than 3
let s = fresh(t0);
s.full = 100;
applyAway(s, t0 + 3 * HOUR);
assert.equal(Math.round(s.full), 50);
assert.equal(s.poops, 1);
assert.equal(s.clean, 75);
applyAway(s, t0 + 40 * HOUR);
assert.equal(s.full, 0);
assert.equal(s.poops, 3);

// feeding: +20, and refuses once full (overfeed reaction)
s = fresh(t0);
s.full = 90;
assert.equal(feed(s), true);
assert.equal(s.full, 100);
assert.equal(feed(s), false);

// petting has a daily cap; flicking costs mood; cleaning restores
s = fresh(t0);
s.mood = 0;
for (let i = 0; i < 20; i++) pet(s);
assert.equal(s.mood, 30);
flick(s);
assert.equal(s.mood, 20);
addPoop(s);
addPoop(s);
assert.equal(s.clean, 50);
cleanPoop(s);
assert.equal(s.clean, 75);

// daily key: never on the first visit; chance climbs +25% per miss and resets after a hit
s = fresh(t0);
s.first = false;
newDay(s, t0 + 24 * HOUR, () => 0.9);
assert.equal(s.keyToday, false);
assert.equal(s.keyChance, 0.75);
assert.equal(s.streak, 2);
newDay(s, t0 + 48 * HOUR, () => 0.7);
assert.equal(s.keyToday, true);
assert.equal(s.keyChance, 0.5);
newDay(s, t0 + 96 * HOUR, () => 0.9); // skipped a day: streak restarts
assert.equal(s.streak, 1);
newDay(s, t0 + 96 * HOUR, () => 0); // same day again: no second roll
assert.equal(s.keyToday, false);
assert.equal(dayOf(t0), '2026-11-12');

// skins: first chest is the acorn hat, never a duplicate, null when the wardrobe is full
assert.equal(drawSkin([]), 'acornHat');
const owned: string[] = [];
for (let i = 0; i < SKIN_IDS.length; i++) {
  const id = drawSkin(owned)!;
  assert.ok(!owned.includes(id));
  owned.push(id);
}
assert.equal(drawSkin(owned), null);

console.log('state-check: all passed');

// rarity: a low roll gives a common skin, a high roll a legendary one (when both are still left)
assert.equal(SKIN_RARITY[drawSkin(['acornHat'], () => 0.1)!], 'common');
assert.equal(SKIN_RARITY[drawSkin(['acornHat'], () => 0.95)!], 'legend');
assert.equal(SKIN_RARITY[drawSkin(SKIN_IDS.filter((id) => SKIN_RARITY[id] === 'common'), () => 0.1)!], 'rare'); // commons used up
console.log('state-check: rarity passed');
