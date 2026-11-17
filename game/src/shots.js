// The screenshot scenes behind ?shot=title|play|wave|over. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// (flee close drones and orbs, chase the nearest shard or pickup, keep a firing distance
// from the nearest drone and shoot at it), so the frame is what a short game really looks
// like and the same seed always gives the same frame.
import { FIELD, STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const TITLE_SECONDS = 6;
const PLAY_SECONDS = 24;
const WAVE_SECONDS = 52;
const OVER_LIMIT_SECONDS = 600;

function nearestEnemy(state) {
  let best = null;
  let bestDist = Infinity;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return { enemy: best, dist: bestDist };
}

function nearestPickup(state) {
  let best = null;
  let bestDist = Infinity;
  for (const p of state.pickups) {
    if (!p.active) continue;
    const d = Math.hypot(p.x - state.player.x, p.y - state.player.y);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return { pickup: best, dist: bestDist };
}

/** One step of steering: returns the control the world takes. */
function autopilot(state, fleeWeight) {
  const p = state.player;
  let fx = 0;
  let fy = 0;
  for (const e of state.enemies) {
    if (!e.active) continue;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 230) {
      const w = ((230 - d) / 230) * fleeWeight;
      fx += (dx / d) * w;
      fy += (dy / d) * w;
    }
  }
  for (const o of state.orbs) {
    if (!o.active) continue;
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < 160) {
      const w = ((160 - d) / 160) * fleeWeight * 1.2;
      fx += (dx / d) * w;
      fy += (dy / d) * w;
    }
  }
  let sx = 0;
  let sy = 0;
  const { pickup, dist: pickupDist } = nearestPickup(state);
  const { enemy, dist: enemyDist } = nearestEnemy(state);
  if (pickup && pickupDist < 520) {
    sx = (pickup.x - p.x) / pickupDist;
    sy = (pickup.y - p.y) / pickupDist;
  } else if (enemy) {
    if (enemyDist > 300) {
      sx = (enemy.x - p.x) / enemyDist;
      sy = (enemy.y - p.y) / enemyDist;
    } else if (enemyDist < 170) {
      sx = -(enemy.x - p.x) / enemyDist;
      sy = -(enemy.y - p.y) / enemyDist;
    }
  } else {
    sx = (FIELD.width / 2 - p.x) / FIELD.width;
    sy = (FIELD.height / 2 - p.y) / FIELD.height;
  }
  let mx = fx + sx;
  let my = fy + sy;
  const length = Math.hypot(mx, my);
  if (length > 1) {
    mx /= length;
    my /= length;
  }
  const aimX = enemy ? enemy.x : FIELD.width / 2;
  const aimY = enemy ? enemy.y : FIELD.height / 2;
  return { mx, my, aimX, aimY, firing: enemy !== null && enemyDist < 560 };
}

function countActive(pool) {
  let n = 0;
  for (const item of pool) if (item.active) n += 1;
  return n;
}

/** A frame worth showing: the wave is running, drones are on screen and shots are flying. */
function busyEnough(state, minWave, minEnemies) {
  return state.wave >= minWave
    && state.waveState === 'active'
    && countActive(state.enemies) >= minEnemies
    && countActive(state.bullets) >= 1;
}

/**
 * Set `world` to the named scene (title, play, wave or over; any other name is title)
 * and return the screen to draw over it and the best score to show. The play and wave
 * scenes stop at the first busy moment (drones on screen, shots flying) so the frame
 * shows the game at full tilt, not the quiet seconds between waves.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'wave' && name !== 'over') {
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) {
      world.step(STEP, { mx: 0, my: 0, aimX: FIELD.width / 2, aimY: FIELD.height / 2, firing: false }, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'over' ? OVER_LIMIT_SECONDS : name === 'wave' ? WAVE_SECONDS : PLAY_SECONDS;
  const flee = name === 'over' ? 0 : 1.6;
  const minWave = name === 'wave' ? 3 : 2;
  const minEnemies = name === 'wave' ? 6 : 4;
  let over = false;
  for (let i = 0; i < limit / STEP; i += 1) {
    const events = world.step(STEP, autopilot(world.state, flee), false);
    if (events & 128) {
      over = true;
      break;
    }
    if (name !== 'over' && busyEnough(world.state, minWave, minEnemies)) break;
  }
  if (over || world.state.player.hearts <= 0) return { screen: SCREEN_OVER, best: world.state.score };
  return { screen: SCREEN_PLAY, best: world.state.score };
}
