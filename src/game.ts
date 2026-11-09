// Score-attack state (no physics, no rendering): 10 throws, best score kept on the device.
export const MAX_THROWS = 10;
const KEY = 'ricochet.best';

const loadBest = () => {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0; // private window / blocked storage
  }
};

// Ghost match (no backend): the opponent is your best saved run, or a built-in run the first time.
const GHOST_KEY = 'ricochet.ghost';
const DEFAULT_GHOST = { name: 'Ghost', points: [2, 0, 5, 8, 0, 2, 10, 0, 5, 8] }; // 40
type Ghost = { name: string; points: number[] };
const loadGhost = (): Ghost => {
  try {
    const g = JSON.parse(localStorage.getItem(GHOST_KEY) || 'null');
    if (g && Array.isArray(g.points)) return g;
  } catch {}
  return DEFAULT_GHOST;
};
const sum = (a: number[], n = a.length) => a.slice(0, n).reduce((x, y) => x + y, 0);

export const game = {
  ghost: loadGhost(),
  runPoints: [] as number[],
  throws: 0,
  score: 0,
  best: loadBest(),
  aces: 0, // Neon Aces landed in the target this run
  over: false,
  ghostBeaten: false,
  targetPlaced: false,
  last: '', // one-line result of the latest throw
  dirty: true, // HUD redraw flag
};

export function record(points: number, bounces: number) {
  game.throws++;
  game.score += points;
  game.runPoints.push(points);
  if (points > 0 && bounces >= 7) game.aces++;
  game.last = points > 0 ? `+${points}  (${bounces} bounce${bounces === 1 ? '' : 's'})` : 'Miss';
  if (game.throws >= MAX_THROWS) {
    game.over = true;
    if (game.score > ghostTotal()) { // your run beats the ghost: it becomes the new ghost
      game.ghostBeaten = true;
      try {
        localStorage.setItem(GHOST_KEY, JSON.stringify({ name: 'Your best', points: game.runPoints }));
      } catch {}
    }
    if (game.score > game.best) {
      game.best = game.score;
      try {
        localStorage.setItem(KEY, String(game.best));
      } catch {}
    }
  }
  game.dirty = true;
}

export function reset() {
  game.throws = 0;
  game.score = 0;
  game.aces = 0;
  game.over = false;
  game.ghostBeaten = false;
  game.runPoints = [];
  game.ghost = loadGhost(); // pick up the new ghost if you just set one
  game.last = '';
  game.dirty = true;
}

export const ghostTotal = () => sum(game.ghost.points);
/** Ghost's running score after the same number of throws you have made. */
export const ghostScoreNow = () => sum(game.ghost.points, game.throws);
