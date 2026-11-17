// Every tuning number and colour for STARSHARD in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends
// on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 14,
  speed: 360,
  accel: 2600,
  fireInterval: 0.16,
  bulletSpeed: 760,
  invulnerable: 1.4,
  hearts: 3,
};

export const BULLET = { radius: 4, damage: 1 };

export const ENEMY = {
  drifter: { hp: 1, speed: 96, speedPerWave: 9, radius: 16, score: 50 },
  spinner: { hp: 2, speed: 62, speedPerWave: 6, radius: 17, score: 100, fireInterval: 2.4, orbSpeed: 210 },
  splitter: { hp: 3, speed: 72, speedPerWave: 7, radius: 20, score: 150 },
  mini: { hp: 1, speed: 185, speedPerWave: 10, radius: 9, score: 25 },
};

export const ORB = { radius: 6, damage: 1 };

/** How a wave is built: drifters grow every wave, spinners join from wave 2, splitters from 3. */
export const WAVE = {
  baseDrifters: 4,
  driftersPerWave: 3,
  spinnerFromWave: 2,
  spinnersPerWave: 1,
  splitterFromWave: 3,
  splittersPerWave: 1,
  spawnGap: 0.55,
  clearBonus: 100,
  breather: 3,
};

export const PICKUP = {
  coreScore: 25,
  coreDropChance: 0.3,
  magnetRadius: 130,
  collectRadius: 26,
  life: 11,
  shieldSeconds: 6,
  rapidSeconds: 8,
  spreadSeconds: 8,
};

export const COMBO = { window: 2.5, max: 8 };

/** Pools are allocated once, at boot; nothing in the simulation allocates after that. */
export const POOL = { bullets: 128, orbs: 96, enemies: 48, particles: 256, pickups: 24, floaters: 16 };

export const PALETTE = {
  backdrop: '#070b16',
  space: '#0d1329',
  nebulaTeal: '#0f3d4a',
  nebulaViolet: '#2b1d52',
  nebulaRose: '#4a1e3d',
  player: '#4fe3ff',
  playerCore: '#eafcff',
  bullet: '#ffe9a3',
  drifter: '#ff4d5e',
  spinner: '#b06bff',
  splitter: '#ff9f2e',
  mini: '#ffc93c',
  orb: '#ff7ad9',
  core: '#ffd94a',
  shield: '#5ea8ff',
  rapid: '#7dff9a',
  spread: '#ff7ad9',
  repair: '#ff6b81',
  panel: '#141b30',
  panelEdge: '#2c3a5e',
  text: '#eef4ff',
  muted: '#93a3c0',
  gold: '#ffd94a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'starshard.best';
