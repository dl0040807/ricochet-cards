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

export const game = {
  throws: 0,
  score: 0,
  best: loadBest(),
  aces: 0, // Neon Aces landed in the target this run
  over: false,
  targetPlaced: false,
  last: '', // one-line result of the latest throw
  dirty: true, // HUD redraw flag
};

export function record(points: number, bounces: number) {
  game.throws++;
  game.score += points;
  if (points > 0 && bounces >= 7) game.aces++;
  game.last = points > 0 ? `+${points}  (${bounces} bounce${bounces === 1 ? '' : 's'})` : 'Miss';
  if (game.throws >= MAX_THROWS) {
    game.over = true;
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
  game.last = '';
  game.dirty = true;
}
